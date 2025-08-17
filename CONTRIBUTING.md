# Contributing to CipherGate

Thank you for your interest in contributing to CipherGate! We welcome contributions from the community to help improve this project.

## 📋 How to Contribute

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
   ```bash
   git clone https://github.com/yourusername/cipher-gate.git
   cd cipher-gate
   ```
3. **Create a new branch** for your feature or bugfix
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** and commit them with a descriptive message
   ```bash
   git commit -m "Add your commit message here"
   ```
5. **Push** your changes to your fork
   ```bash
   git push origin feature/your-feature-name
   ```
6. Create a **Pull Request** from your fork to the main repository

## 🛠 Development Setup

1. Install dependencies:
   ```bash
   # Install server dependencies
   cd server
   npm install
   
   # Install client dependencies
   cd ../client
   npm install
   ```

2. Set up environment variables by copying the example files:
   ```bash
   # In both server/ and client/ directories:
   cp .env.example .env
   ```

3. Start the development servers:
   ```bash
   # In server directory
   npm run dev
   
   # In client directory (new terminal)
   cd ../client
   npm start
   ```

## ✅ Code Style

- Follow the existing code style and formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Keep commits small and focused

## 🧪 Testing

Please make sure all tests pass before submitting a PR:

```bash
# Run server tests
cd server
npm test

# Run client tests
cd ../client
npm test
```

## 📝 Pull Request Guidelines

- Provide a clear description of your changes
- Reference any related issues
- Include screenshots for UI changes
- Ensure all tests pass
- Update documentation as needed

## 📜 Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## 🙏 Thank You!

Your contributions make open source projects like this possible. Thank you for taking the time to contribute!
