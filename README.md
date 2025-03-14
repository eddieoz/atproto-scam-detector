# Crypto-Labeler

## Project Overview

Crypto-Labeler is an advanced, AI-powered labeling and moderation tool dedicated to protecting the BlueSky community. By identifying and addressing crypto spammers, scammers, phishing attempts, and other malicious activities, it fosters a safer, more trustworthy, and transparent online environment for all users.

This bot leverages [ATProto](https://github.com/bluesky-social/atproto) and the Ozone server protocol to identify and label harmful behavior. It utilizes advanced AI capabilities to detect spam, scams, bots, and phishing accounts, streamlining moderation efforts on the BlueSky platform.

---

## Getting Started

### Prerequisites

To run Crypto Labeler, ensure you have the following installed:

- **Node.js** (version 20 or higher)
- **Pnpm** (version 9.15.0 or higher)
- **DeepSeek-V3 API** you need an account and API key to use the DeepSeek API.
- **Ozone Labeler** (registered with moderator permissions on the BlueSky network; see [Ozone](https://github.com/bluesky-social/ozone) for details)
- **PM2** (optional) PM2 is a daemon process manager that will help you manage and keep your application online 24/7

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-repo-url>
   ```
2. Navigate to the project directory:
   ```bash
   cd crypto-labeler
   ```
3. Install dependencies using Pnpm:
   ```bash
   pnpm install
   ```

---

## Usage

To start the bot, run:

```bash
pnpm start
```

This command initiates the bot, resuming a previous session if available or logging in as a new session.

If you want to run with pm2
```bash
pm2 start app.json
```
(`pm2 logs scam-detector` to see the logs output)

### Configuration

The bot uses environment variables for authentication and configuration. Set these variables in a `.env` file located in the root directory of the project. Use the sample file as a template:

```bash
cp .env-sample .env
```

Adjust the values in `.env` as needed.

### Pre-Filter 
- Add Scam Terms to the `scamTerms` array in `lists/scam_terms.js`.
- Add Ignored handles to the `handleIgnore` array in `lists/handle_ignore_array.js`.

---

## Database

The bot uses an SQLite database to manage automatically ignored handles and their expiration times. The database file is located at `./ignoreHandles.db`.

### Database Schema

The `ignore_handles` table consists of the following columns:

- `handle`: The handle to be ignored (primary key)
- `expiration_time`: The expiration timestamp in milliseconds

---

## Diagram

![diagram](docs/diagram.png)
Made with https://gitdiagram.com/eddieoz/atproto-scam-detector

## Contributing

Contributions are highly encouraged! If you wish to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request with your changes.

Your support helps improve Crypto Labeler and its impact on the BlueSky community.

---

## License

This project is licensed under the MIT License. See the `LICENSE.txt` file for full details.

---

## Support This Project

If you found this project helpful, please consider supporting it:

[Buy me a coffee](https://www.buymeacoffee.com/eddieoz)

[![Buy me a coffee](https://ipfs.io/ipfs/QmR6W4L3XiozMQc3EjfFeqSkcbu3cWnhZBn38z2W2FuTMZ?filename=buymeacoffee.webp)](https://www.buymeacoffee.com/eddieoz)

Or drop me a tip through Lightning Network: ⚡ [getalby.com/p/eddieoz](https://getalby.com/p/eddieoz)

Your contributions and support are greatly appreciated!