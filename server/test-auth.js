const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Create an in-memory MongoDB database for testing
const { MongoMemoryServer } = require('mongodb-memory-server');

async function setupTestEnvironment() {
  // Start the in-memory MongoDB server
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(uri);
  
  // Define a simple user schema
  const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'user' },
    status: { type: String, default: 'active' }
  });
  
  const User = mongoose.model('User', userSchema);
  
  // Create test user
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);
  
  const testUser = await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: hashedPassword,
    role: 'user',
    status: 'active'
  });
  
  console.log('Test user created successfully!');
  console.log('Email: test@example.com');
  console.log('Password: password123');
  
  // Create a simple Express server to test login
  const app = express();
  
  // Enable CORS
  app.use(cors({
    origin: 'http://localhost:3000', // Your frontend URL
    credentials: true
  }));
  
  app.use(express.json());
  
  // Login endpoint
  app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user._id }, 'test-secret', { expiresIn: '1h' });
      
      res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        token
      });
      
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
  const PORT = 5001;
  app.listen(PORT, () => {
    console.log(`Test auth server running on http://localhost:${PORT}`);
    console.log('You can test login with:');
    console.log('POST http://localhost:5001/login');
    console.log('Body: { "email": "test@example.com", "password": "password123" }');
  });
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  });
}

setupTestEnvironment().catch(console.error);
