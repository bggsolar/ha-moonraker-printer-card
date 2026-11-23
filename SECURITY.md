# Security policy

## Supported versions

Only the latest release is supported.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private reporting instead:
*Security → Report a vulnerability* in this repository.
You will get an answer within a few days.

## Design notes

- The card is a single JavaScript file without dependencies and loads nothing from external hosts.
- It only talks to Home Assistant through the frontend's own connection (`hass.callService`);
  it never contacts the printer directly.
- All text that comes from entity states (file names, friendly names) is HTML-escaped before rendering.
- The repository contains no secrets, tokens or personal data.
