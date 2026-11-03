# Code signing

Cursora's build, release pipeline and updater are ready for code signing. **Releases
are unsigned until a certificate is configured**, and this page explains how to get
one, which option fits, and how to turn it on. Nothing in the repository changes when
you do: signing is configured with GitHub **Variables** and **Secrets** (or environment
variables for a local build), so no certificate or password is ever committed.

- [What signing does and doesn't do](#what-signing-does-and-doesnt-do)
- [Choosing a certificate](#choosing-a-certificate)
- [Setting it up](#setting-it-up)
- [The publisher name](#the-publisher-name-read-this-before-the-first-signed-release)
- [Releasing a signed version](#releasing-a-signed-version)
- [Verifying a build](#verifying-a-build)
- [Looking after it](#looking-after-it)
- [Troubleshooting](#troubleshooting)
- [What was tested](#what-was-tested)
- [Sources](#sources)

## What signing does and doesn't do

Signing proves **who published** a file and that it **hasn't been changed** since. Windows
shows the publisher's name instead of "Unknown publisher", and Cursora's updater uses the
signature to refuse updates that weren't published by you.

Signing **does not remove the SmartScreen warning on day one.** Microsoft is explicit:

- SmartScreen weighs publisher reputation and file reputation. A new publisher starts with
  none, so signed downloads can still show "Windows protected your PC" until reputation
  builds. That typically takes **weeks and hundreds of clean installs**, and it carries over
  to later releases **only if you keep signing with the same identity**.
- **EV certificates no longer bypass SmartScreen** (since 2024). Don't pay the EV premium
  for that.
- Unsigned files must rebuild reputation with every release. On Windows 11, Smart App
  Control can block unsigned executables outright, which is why the build also signs the
  native module Cursora loads (`koffi.node`), not only the `.exe` files.

## Choosing a certificate

Windows requires publicly trusted code-signing keys to live in secure hardware or a cloud
HSM, so you can no longer just download a certificate file. The realistic options:

| Option | Cost | Who can use it | Fits Cursora as | Notes |
| --- | --- | --- | --- | --- |
| **Azure Artifact Signing** (formerly Trusted Signing) | about $10 a month (Basic) | Individuals: USA and Canada. Organizations: USA, Canada, EU, UK | `azure` | Microsoft's recommended route for apps outside the Store. Needs a paid Azure subscription (not free, trial or sponsored). Identity check with a government ID. Built for CI. |
| **OV certificate on a cloud HSM** (SSL.com, DigiCert, Sectigo, GlobalSign...) | about $150 to $300 a year | Worldwide | `command` | The route outside the regions above. Keys must be in hardware or a cloud HSM, and certificates last at most about 15 months. Each vendor has its own signing tool. |
| **Certum "open source" certificate** | from about 49 EUR (check the shop) | Worldwide | `store` (local builds) | Cheapest. The subject carries an "Open Source Developer" prefix. Its cloud signing uses one-time passwords, which suits signing on your own PC rather than in GitHub Actions. |
| **SignPath Foundation** | Free for open source | Qualifying open-source projects | Not supported here | The publisher shown is "SignPath Foundation", needs an OSI-approved license file, multi-factor authentication for every maintainer, and manual approval for every release. It signs after the build, whereas this pipeline signs during it so that `latest.yml` stays correct; adopting it would need an extra re-hash step. |
| **Microsoft Store (MSIX)** | Free | Anyone | Not supported here | Microsoft re-signs the package and users never see SmartScreen. It needs different packaging and Store certification. |
| **EV certificate** | $400+ a year | Worldwide | `command` or `store` | No SmartScreen advantage any more. Only worth it if a customer requires it. |

**Recommendation.** If you live in the USA, Canada, the EU or the UK, choose **Azure Artifact
Signing**: cheapest, fully automated, and Microsoft-run. Anywhere else, choose an **OV
certificate from a CA that offers cloud signing** and use the `command` method (or Certum
and the `store` method if you are happy to sign on your own PC). Whatever you choose,
the identity check can take several business days, so start it early.

## Setting it up

The build picks the method from which settings exist. Set **one** method (if two are set,
the build stops and asks you to choose with `CURSORA_SIGN_MODE`).

### Settings reference

| Name | Kind | Method | Meaning |
| --- | --- | --- | --- |
| `CURSORA_PUBLISHER_NAME` | Variable | azure, command (recommended for all) | The signer name exactly as in the certificate. Several names separated by `\|`. See [the publisher name](#the-publisher-name-read-this-before-the-first-signed-release). |
| `CURSORA_REQUIRE_SIGNING` | Variable | all | `true` makes an unsigned or badly signed build fail. Turn it on after your first good signed release. |
| `CURSORA_SIGN_MODE` | Variable | optional | `azure`, `pfx`, `store`, `command` or `none`, only to choose between two configured methods. |
| `CURSORA_TIMESTAMP_URL` | Variable | optional | Timestamp server. Defaults to Microsoft's for Azure and DigiCert's otherwise. |
| `CURSORA_AZURE_ENDPOINT` | Variable | azure | Your account's regional endpoint, e.g. `https://eus.codesigning.azure.net/`. |
| `CURSORA_AZURE_ACCOUNT` | Variable | azure | The Artifact Signing account name. |
| `CURSORA_AZURE_PROFILE` | Variable | azure | The certificate profile name. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | **Secrets** | azure | The service principal that signs. |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | **Secrets** | pfx | electron-builder's own: the certificate file (path, https URL or base64) and its password. |
| `CURSORA_SIGN_SHA1` or `CURSORA_SIGN_SUBJECT` | env (local builds) | store | Thumbprint (or subject) of a certificate in the Windows certificate store. |
| `CURSORA_SIGN_COMMAND` | **Secret** | command | JSON array: the signing program, its arguments, and `{file}` where the file path goes. |

Variables are under **Settings, Secrets and variables, Actions, Variables**; secrets are on
the neighbouring tab. GitHub hides secret values in logs, and only the build step can see them.

### Azure Artifact Signing

1. In the [Azure portal](https://portal.azure.com), use a **paid** subscription and register the
   `Microsoft.CodeSigning` resource provider.
2. Create an **Artifact Signing account** (the **Basic** plan is enough). The region you pick
   decides the endpoint (for example East US is `https://eus.codesigning.azure.net/`).
3. Complete **identity validation** (an individual or an organization) and wait for it to
   show **Completed**. Microsoft validates you with a government-issued ID; allow a few
   business days.
4. Create a **certificate profile** of type **Public Trust** using that validation.
   **The signer name is your validated legal name** and cannot be customized.
5. Create a **service principal** (an app registration in Microsoft Entra ID) with a client
   secret, and give it the role **Artifact Signing Certificate Profile Signer** on the account.
6. In GitHub, add the three **Variables** `CURSORA_AZURE_ENDPOINT`, `CURSORA_AZURE_ACCOUNT`,
   `CURSORA_AZURE_PROFILE`, the Variable `CURSORA_PUBLISHER_NAME` (your validated name,
   exactly), and the **Secrets** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

Azure's certificates are short-lived, so the build always **timestamps** signatures; that is what
keeps them valid after the certificate expires. The workflow installs Microsoft's
`TrustedSigning` module itself and stops if it can't.

### Certificate in a file (pfx)

For certificates you can export (an enterprise or private CA, or a test certificate): set
`CSC_LINK` and `CSC_KEY_PASSWORD`. Most new public certificates can't be exported, so this
is mainly useful for testing. Never commit the file; `.gitignore` already blocks `*.pfx` and
other key formats.

### Certificate in the Windows store (hardware token or SimplySign)

For a certificate that lives in a token or a vendor's cloud-signing client on your own PC:
install the vendor's software so the certificate appears in the Windows certificate store, then
build and sign **locally**:

```powershell
$env:CURSORA_SIGN_SHA1 = "<thumbprint of the certificate>"
$env:CURSORA_REQUIRE_SIGNING = "1"
npm run dist
npm run verify:signing
```

GitHub's servers can't reach a key on your PC, so with this method you upload
`Cursora-Setup-<version>.exe`, its `.blockmap`, `latest.yml` and the portable `.exe` to a GitHub
release yourself instead of using the release workflow.

### A vendor's signing tool (command)

For SSL.com, DigiCert, Certum and others that provide a command-line signer. Set the Secret
`CURSORA_SIGN_COMMAND` to a JSON array, for example (check your vendor's documentation for the
real arguments; this one only shows the shape):

```json
["C:\\tools\\vendor-signer.exe", "sign", "--credential", "<secret>", "--input", "{file}"]
```

Then install the vendor's tool in the workflow before the build step (add a step to
`.github/workflows/release.yml`) and set `CURSORA_PUBLISHER_NAME`. The build runs the tool
once per file, one at a time, never prints its arguments, hides them from any error text,
and fails if the tool exits successfully without actually signing.

## The publisher name (read this before the first signed release)

Installed copies of Cursora remember the publisher name from **the version they were installed
from** (`publisherName` in `app-update.yml`) and refuse any update whose signer doesn't match it.
That protects your users, but it means a wrong value can lock every installed copy out of
updates.

- It must match the certificate's signer **exactly**. Use the name Windows shows on the file's
  Digital Signatures tab. A full Distinguished Name (`CN=Jane Doe, O=...`) is stricter than the
  bare common name.
- With Azure, command and store methods the build needs it from you (`CURSORA_PUBLISHER_NAME`);
  with a certificate file it is read from the certificate.
- The build **verifies** that the signer matches it, and the release is blocked if it doesn't.
- **Going from unsigned to signed is smooth:** copies installed from an unsigned release check
  nothing, so they accept the first signed update, which then carries the publisher name.
- **Changing the signer later needs a bridge release.** A copy installed under the old name
  will reject an update signed by the new certificate. So: release N is signed with the **old**
  certificate but lists both names (`Old Name|New Name`), and only release N+1 is signed with the
  new certificate.

## Releasing a signed version

The release steps are unchanged (raise the version, write `RELEASE_NOTES.md`, tag and push; see
the README). With signing configured, the workflow also:

1. runs the signing unit tests;
2. signs the app, the installer, the portable app, `elevate.exe`, the uninstaller and `koffi.node`,
   with SHA-256 and a timestamp, **before** `latest.yml` is hashed (otherwise every update would be
   rejected);
3. **verifies** the result (below) and leaves the release as a draft if anything is wrong;
4. publishes, and shows "Signed by ..." on the run's summary page.

Your first signed release: configure everything, push a tag, and check the summary page. Once it
says **Signed**, install it on a clean PC, and then set the variable `CURSORA_REQUIRE_SIGNING` to
`true` so that an unsigned release can never go out again. Afterwards, update the SmartScreen notes
on the website (the FAQ in `website/lib/content.js`, the install step in
`website/app/download/page.js` and the answer in `website/app/support/page.js`), which still say
Cursora isn't signed yet.

## Verifying a build

```powershell
npm run verify:signing            # checks the build in dist/
npm run verify:signing -- --require   # also fails if it is unsigned
```

It checks that every shipped binary is signed with a valid, **timestamped** signature from **one**
publisher; that this publisher matches `publisherName` in `app-update.yml`; and that `latest.yml`'s
SHA-512 and size match the installer. It exits with an error if anything is off. An unsigned build
passes with a notice unless signing is required. (`--allow-untrusted` accepts a self-signed
certificate for testing only; never use it for a release.)

You can also look at a file yourself: right-click it, **Properties, Digital Signatures**, or run
`Get-AuthenticodeSignature .\Cursora-Setup-<version>.exe` in PowerShell.

## Looking after it

- **Secrets expire.** An Azure client secret lasts months to two years; put the expiry date in your
  calendar, and create the new secret before the old one ends.
- **Identity validation expires** (Microsoft emails reminders from 60 days before). If it lapses,
  signing stops until you renew it.
- **OV certificates last at most about 15 months.** Renew before expiry, with the **same legal name**
  so reputation continues. Old releases stay valid because of their timestamps.
- **If a key or secret leaks:** revoke the certificate or rotate the secret with your provider,
  then publish a new release.
- Never sign anything that behaves like malware; a certificate with a bad record loses reputation
  for every release.
- Don't modify a file after it is signed (including re-zipping or editing the installer).

## Troubleshooting

| You see | Meaning |
| --- | --- |
| `Signing is required ... but no signing method is configured` | `CURSORA_REQUIRE_SIGNING` is on but no certificate settings reached the build. Check the Variables and Secrets names. |
| `More than one signing method is configured` | Remove the extra settings or set `CURSORA_SIGN_MODE`. |
| `CURSORA_PUBLISHER_NAME is required ...` | Azure and command signing can't read the name from the certificate; add it. |
| `The specified PFX password is not correct` | `CSC_KEY_PASSWORD` doesn't match the file. |
| `... root certificate which is not trusted` | The certificate isn't from a CA Windows trusts (a self-signed test certificate, for example). |
| `publisherName ... does not match the signer` | The name you set differs from the certificate's. Copy it from the Digital Signatures tab. |
| `has no trusted timestamp` | The timestamp server wasn't reachable or wasn't set. Retry, or set `CURSORA_TIMESTAMP_URL`. |
| `latest.yml SHA-512 does not match the installer` | The installer changed after being hashed. Rebuild; don't edit files in `dist/`. |
| In the app: "The update's digital signature doesn't match Cursora's publisher" | An update wasn't signed by the publisher this copy trusts. Expected for a forged update; after a certificate change, see the bridge release above. |
| Azure `AADSTS...` or HTTP 403 | The service principal's secret is wrong or expired, or it lacks the **Artifact Signing Certificate Profile Signer** role. |

## What was tested

The pieces that don't need an external account were tested for real, with a self-signed certificate:
all signing methods except Azure (file, certificate store, and a vendor-style command) signing the
installer, portable app, app, `elevate.exe`, uninstaller and `koffi.node`; verification passing, and
failing for an untrusted certificate, a tampered installer and a wrong password; a signed app
refusing an unsigned update; and the build refusing misconfiguration instantly. The Azure path was
run through electron-builder with fake credentials and got as far as Microsoft's sign-in, with
the module accepting every parameter. **Signing with a real Azure account, and the vendor
tools, are untested until you supply real accounts**, which is why the first signed release should be
checked on the run's summary page before you turn on `CURSORA_REQUIRE_SIGNING`.

## Sources

- Microsoft, [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- Microsoft, [SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- Microsoft, [Artifact Signing overview](https://learn.microsoft.com/en-us/azure/artifact-signing/overview) and [FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
- Microsoft, [Artifact Signing GitHub Action](https://github.com/Azure/artifact-signing-action) (timestamping, roles)
- SignPath Foundation, [terms and conditions](https://signpath.org/terms)
- Certum, [Open Source Code Signing](https://shop.certum.eu/open-source-code-signing-on-simplysign.html)
- Keyfactor, [Shorter certificate lifespans are coming for code signing](https://www.keyfactor.com/blog/shorter-certificate-lifespans-are-coming-for-code-signing/)
- electron-builder, [Code signing for Windows](https://www.electron.build/code-signing-win)
