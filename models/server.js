const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const Complaint = require('./complaint');
const session = require('express-session');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.WEBAPP_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const ADMIN_ID = process.env.ADMIN_ID;

// Enable CORS for all routes
app.use(cors({
  origin: process.env.WEBAPP_URL || '*',
  credentials: true
}));

// Налаштування session middleware з безпечним cookie на продакшені
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
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// Оновлений запуск сервера
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

module.exports = { updateClients: () => io.emit('update') };