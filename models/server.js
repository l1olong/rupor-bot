const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const Complaint = require('./complaint');
const session = require('express-session');
const cors = require('cors');

// Initialize express and create HTTP server
const app = express();
const server = http.createServer(app);

// Healthcheck endpoint - must be first
app.get('/health', async (req, res) => {
  try {
    // Check MongoDB connection
    const isMongoConnected = mongoose.connection.readyState === 1;
    
    if (!isMongoConnected) {
      throw new Error('MongoDB is not connected');
    }

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongoStatus: 'connected'
    });
  } catch (error) {
    console.error('Healthcheck failed:', error);
    res.status(503).json({
      status: 'error',
      message: error.message
    });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Basic routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const ADMIN_ID = process.env.ADMIN_ID;

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  credentials: true
}));

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(express.json());

// Базові middleware для безпеки
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers');
  next();
});

// Authentication middleware
const auth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const adminAuth = (req, res, next) => {
  if (!req.session.userId || req.session.userRole !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Login route
app.post('/api/login', (req, res) => {
  const { userId, isTelegram } = req.body;
  
  req.session.userId = userId;
  req.session.userRole = userId === ADMIN_ID ? 'admin' : 'user';
  req.session.isTelegram = isTelegram;
  
  res.json({ 
    role: req.session.userRole,
    userId: req.session.userId 
  });
});

// Get current user
app.get('/api/user', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  
  res.json({
    userId: req.session.userId,
    role: req.session.userRole
  });
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

// Get complaints - filtered by user role
app.get('/api/complaints', auth, async (req, res) => {
  try {
    let complaints;
    if (req.session.userRole === 'admin') {
      complaints = await Complaint.find().sort({ createdAt: -1 });
    } else {
      complaints = await Complaint.find({ 
        userId: req.session.userId 
      }).sort({ createdAt: -1 });
    }
    
    res.json(complaints.map(complaint => ({
      id: complaint._id,
      type: complaint.type,
      message: complaint.message,
      contactInfo: complaint.contactInfo,
      status: complaint.status,
      date: complaint.createdAt,
      adminResponse: complaint.adminResponse,
      userId: complaint.userId,
      userRole: complaint.userRole
    })));
  } catch (error) {
    console.error('Error getting complaints:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit complaint
app.post('/api/complaints', auth, async (req, res) => {
  try {
    const complaint = new Complaint({
      userId: req.session.userId,
      userRole: req.session.userRole,
      type: req.body.type,
      message: req.body.message,
      contactInfo: req.body.contactInfo || 'No contact information',
      attachments: []
    });
    
    await complaint.save();
    io.emit('newComplaint', complaint);
    res.status(201).json(complaint);
  } catch (error) {
    console.error('Error saving complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin response to complaint
app.put('/api/complaints/:id/respond', adminAuth, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    complaint.status = 'answered';
    complaint.adminResponse = {
      text: req.body.response,
      date: new Date()
    };
    
    await complaint.save();
    io.emit('complaintUpdated', complaint);
    res.json(complaint);
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ 
    status: 'error',
    message: 'Not Found' 
  });
});

// Initialize MongoDB connection
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Start server only after MongoDB connects
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    const PORT = process.env.PORT || 3000;
    const HOST = '0.0.0.0';

    server.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { updateClients: () => io.emit('update') };