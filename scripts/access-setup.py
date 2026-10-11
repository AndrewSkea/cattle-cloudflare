#!/usr/bin/env python3
"""
Puts hooveswho.andrewskea.com behind Cloudflare Access with the same policy as the ayrenergy site.

  CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… python3 scripts/access-setup.py [--source ayrenergy] [--rotate-token]

- Finds the Access application whose name or domain contains --source and uses its policies, in order.
  A reusable policy is attached as-is (one policy, two apps — edit it once and both sites change). A
  policy that only exists inside that app is copied to a new reusable policy with identical rules.
  The ayrenergy app itself is never modified.
- Copies its login settings (identity providers, session length, auto-redirect).
- Adds a service token "HoovesWho CI" (non-identity policy) so the deploy's production smoke tests can get
  in, and stores it as the CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET GitHub secrets with `gh`.
Safe to re-run: it updates the HoovesWho app in place and keeps the existing service token unless --rotate-token.

The API token needs Account permissions: Access: Apps and Policies Edit, Access: Service Tokens Edit.
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

APP_NAME = 'HoovesWho'
APP_DOMAIN = 'hooveswho.andrewskea.com'
CI_TOKEN_NAME = 'HoovesWho CI'
CI_POLICY_NAME = 'HoovesWho CI (service token)'
REPO = 'AndrewSkea/cattle-cloudflare'
RULE_FIELDS = ('decision', 'include', 'exclude', 'require', 'session_duration', 'approval_required',
               'approval_groups', 'isolation_required', 'purpose_justification_required',
               'purpose_justification_prompt', 'connection_rules')
APP_FIELDS = ('session_duration', 'allowed_idps', 'auto_redirect_to_identity', 'app_launcher_visible',
              'enable_binding_cookie', 'http_only_cookie_attribute', 'same_site_cookie_attribute', 'skip_interstitial')


def api(method, path, body=None):
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    req = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/accounts/{account}{path}', method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}", 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)['result']
    except urllib.error.HTTPError as e:
        sys.exit(f'Cloudflare API {method} {path} failed ({e.code}): {e.read().decode()[:500]}')


def domains(app):
    return [app.get('domain') or ''] + (app.get('self_hosted_domains') or []) + [d.get('uri', '') for d in app.get('destinations') or []]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='ayrenergy', help='text in the name or domain of the Access app to copy')
    p.add_argument('--rotate-token', action='store_true', help='create a new CI service token even if one exists')
    args = p.parse_args()
    for v in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'):
        if not os.environ.get(v):
            sys.exit(f'{v} is not set')

    apps = api('GET', '/access/apps?per_page=100')
    source = [a for a in apps if args.source.lower() in (a.get('name', '') + ' ' + ' '.join(domains(a))).lower()
              and a.get('name') != APP_NAME]
    exact = [a for a in source if a.get('name', '').lower() == args.source.lower()]
    if exact:
        source = exact  # e.g. the "Ayrenergy" app rather than every *.ayrenergy.com device app
    if len(source) != 1:
        print(f'Expected exactly one Access app matching "{args.source}", found {len(source)}:')
        for a in apps:
            print(f"  - {a.get('name')}  ({', '.join(d for d in domains(a) if d)})")
        sys.exit('Re-run with --source <text unique to the ayrenergy app>.')
    src = source[0]
    print(f"Source app: {src['name']} ({', '.join(d for d in domains(src) if d)})")

    # The app's policies, in precedence order. Reusable ones are shared; app-only ones are copied.
    src_policies = sorted(api('GET', f"/access/apps/{src['id']}/policies"), key=lambda x: x.get('precedence', 0))
    if not src_policies:
        sys.exit('The source app has no policies — nothing to copy.')
    reusable = {x['id']: x for x in api('GET', '/access/policies?per_page=100')}
    policy_ids = []
    for pol in src_policies:
        if pol.get('reusable') or pol['id'] in reusable:
            print(f"  shares reusable policy: {pol['name']} ({pol['decision']})")
            policy_ids.append(pol['id'])
            continue
        name = f"{pol['name']} (shared with {APP_NAME})"
        existing = next((x for x in reusable.values() if x['name'] == name), None)
        rules = {k: pol[k] for k in RULE_FIELDS if pol.get(k) not in (None, [], '')}
        if existing:
            api('PUT', f"/access/policies/{existing['id']}", {'name': name, **rules})
            print(f"  updated copy of app-only policy: {name}")
            policy_ids.append(existing['id'])
        else:
            created = api('POST', '/access/policies', {'name': name, **rules})
            print(f"  copied app-only policy to reusable policy: {name}")
            policy_ids.append(created['id'])

    # Service token for CI smoke tests.
    tokens = api('GET', '/access/service_tokens?per_page=100')
    token = next((t for t in tokens if t['name'] == CI_TOKEN_NAME), None)
    if token is None or args.rotate_token:
        if token:
            api('DELETE', f"/access/service_tokens/{token['id']}")
        token = api('POST', '/access/service_tokens', {'name': CI_TOKEN_NAME, 'duration': '8760h'})
        for secret, value in (('CF_ACCESS_CLIENT_ID', token['client_id']), ('CF_ACCESS_CLIENT_SECRET', token['client_secret'])):
            subprocess.run(['gh', 'secret', 'set', secret, '--repo', REPO], input=value.encode(), check=True)
        print(f'  created service token "{CI_TOKEN_NAME}" (valid 1 year) and saved it as GitHub secrets')
    else:
        print(f'  keeping existing service token "{CI_TOKEN_NAME}" (expires {token.get("expires_at", "?")})')
    ci_policy = next((x for x in reusable.values() if x['name'] == CI_POLICY_NAME), None)
    ci_rules = {'name': CI_POLICY_NAME, 'decision': 'non_identity', 'include': [{'service_token': {'token_id': token['id']}}]}
    ci_policy = api('PUT', f"/access/policies/{ci_policy['id']}", ci_rules) if ci_policy else api('POST', '/access/policies', ci_rules)

    body = {
        'name': APP_NAME, 'type': 'self_hosted', 'domain': APP_DOMAIN,
        'destinations': [{'type': 'public', 'uri': APP_DOMAIN}],
        **{k: src[k] for k in APP_FIELDS if src.get(k) is not None},
        'policies': [{'id': pid, 'precedence': i + 1} for i, pid in enumerate(policy_ids + [ci_policy['id']])],
    }
    mine = next((a for a in apps if a.get('name') == APP_NAME or APP_DOMAIN in domains(a)), None)
    if mine:
        api('PUT', f"/access/apps/{mine['id']}", body)
        print(f'Updated Access app {APP_NAME} for {APP_DOMAIN}')
    else:
        api('POST', '/access/apps', body)
        print(f'Created Access app {APP_NAME} for {APP_DOMAIN}')
    print('Done. Open https://' + APP_DOMAIN + ' in a private window: you should see the same Cloudflare Access login as ayrenergy.')


if __name__ == '__main__':
    main()
