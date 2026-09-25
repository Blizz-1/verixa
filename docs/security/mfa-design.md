# MFA Design & Security Properties

## Backup Codes

Backup codes provide a critical recovery path for users who lose access to their primary second factors (like a TOTP device or passkey). 

### Storage Strategy: Hashed, Never Encrypted

Unlike TOTP secrets—which must be symmetrically encrypted at rest because the server requires the plaintext to compute the expected HMAC during login—backup codes are **hashed** using a slow key derivation function (Argon2), identical to the strategy we use for passwords in Issue 061.

**Why?**
Backup codes are effectively low-entropy, system-generated passwords. They are used exactly once and presented in plaintext by the user. 
If we encrypted them at rest (like TOTP secrets), an attacker with database read access and the application's encryption key could decrypt the backup codes and bypass MFA on any account. By hashing them instead, we ensure that even a full compromise of the database and the environment variables (including the encryption key) does not reveal the backup codes. The server only needs to verify the hash when a user submits a code, meaning it never needs to recover the plaintext.

### Single-Use Enforcement

Each backup code is single-use. Once a code is successfully verified, its corresponding hash must be immediately removed from the database to prevent replay attacks. Because they are hashed, removing a single code's hash does not compromise the security of the remaining unused codes in the set.
