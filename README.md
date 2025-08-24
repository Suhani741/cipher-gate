# CipherGate - Secure File Sharing with AI Risk Scoring

[![Node.js Version](https://img.shields.io/badge/node-16.x%20%7C%7C%2018.x-brightgreen.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-brightgreen.svg)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)

CipherGate is a secure file sharing platform with AI-powered risk assessment. It provides end-to-end encrypted file storage with real-time threat detection and user access controls.

## ✨ Features

- 🔒 Secure file storage with end-to-end encryption (AES-256)
- 🤖 AI-powered risk scoring for all uploaded files
- 👥 Role-based access control (Admin, User)
- 🛡️ Automatic quarantine for suspicious files
- 📊 Dashboard with file analytics
- 📱 Responsive design for all devices
- 🔄 Real-time file scanning and status updates

## 🚀 Quick Start

### Prerequisites

- Node.js 16.x or 18.x
- MongoDB 4.4+
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/cipher-gate.git
   cd cipher-gate
   ```

2. Install dependencies for both client and server:
   ```bash
   # Install server dependencies
   cd server
   npm install
   
   # Install client dependencies
   cd ../client
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in both `server` and `client` directories
   - Update the values in `.env` files with your configuration

4. Start the development servers:
   ```bash
   # In server directory
   npm run dev
   
   # In client directory (new terminal)
   cd ../client
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## 📂 Project Structure

```
cipher-gate/
├── client/                 # React frontend
│   ├── public/            # Static files
│   └── src/               # React source code
│       ├── components/    # Reusable components
│       ├── pages/         # Page components
│       └── App.js         # Main app component
│
├── server/                # Node.js/Express backend
│   ├── config/           # Configuration files
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Express middleware
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   └── server.js         # Server entry point
│
└── README.md             # This file
```

## 🔧 Environment Variables

Create `.env` files in both `client` and `server` directories based on the provided `.env.example` files.

## 🧪 Testing

```bash
# Run server tests
cd server
npm test

# Run client tests
cd ../client
npm test
```

## 🛠 Built With

- **Frontend**: React, Redux, TailwindCSS
- **Backend**: Node.js, Express, MongoDB, Mongoose
- **Security**: JWT, bcrypt, helmet, rate limiting
- **AI/ML**: Custom risk scoring algorithms

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Icons by [Heroicons](https://heroicons.com/)
- UI Components by [Headless UI](https://headlessui.com/)
- Styling with [Tailwind CSS](https://tailwindcss.com/)
