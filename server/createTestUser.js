const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ciphergate-dev', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User model
const User = require('./models/userModel');

// Test user data
const testUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: 'password123',
  role: 'user',
  status: 'active'
};

async function createTestUser() {
  try {
    // Check if user already exists
    const userExists = await User.findOne({ email: testUser.email });
    
    if (userExists) {
      console.log('Test user already exists:');
      console.log({
        email: userExists.email,
        password: 'password123',
        id: userExists._id
      });
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(testUser.password, salt);

    // Create user
    const user = await User.create({
      ...testUser,
      password: hashedPassword
    });

    console.log('Test user created successfully:');
    console.log({
      email: user.email,
      password: testUser.password,
      id: user._id
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();
