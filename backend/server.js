// ─── server.js — FinTrack Pro Backend ────────────────────────────────────────
// Node.js + Express + MongoDB Atlas
// Run: node server.js
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const dotenv     = require('dotenv');
const path       = require('path');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ─── EMAIL CONFIGURATION ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve frontend static files (when running in production)
app.use(express.static(path.join(__dirname, './frontend')));

// ─── MONGODB CONNECTION ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => { console.error('❌ MongoDB connection error:', err); process.exit(1); });

// ─── USER SCHEMA ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  userName:    { type: String, required: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  password:    { type: String, required: true },
  budget:      { type: Number, default: 10000 },
  currency:    { type: String, default: '₹' },
  createdAt:   { type: Date, default: Date.now },
  budgetExceededNotified: { type: Boolean, default: false },
});

const User = mongoose.model('User', userSchema);

// ─── EXPENSE SCHEMA ───────────────────────────────────────────────────────────
const expenseSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:        { type: String, required: true },         // "YYYY-MM-DD"
  desc:        { type: String, required: true },
  cat:         { type: String, required: true,
                 enum: ['Food','Travel','Shopping','Entertainment','Health','Bills','Other'] },
  pay:         { type: String, required: true,
                 enum: ['UPI','Cash','Card','Net Banking'] },
  amt:         { type: Number, required: true, min: 0 },
  tags:        { type: [String], default: [] },
  notes:       { type: String, default: '' },
  pri:         { type: String, required: true,
                 enum: ['need','want','luxury'], default: 'need' },
  createdAt:   { type: Date, default: Date.now },
});

const Expense = mongoose.model('Expense', expenseSchema);

// ─── BUDGET SCHEMA ────────────────────────────────────────────────────────────
const budgetSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month:   { type: String, required: true }, // "YYYY-MM"
  amount:  { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});
budgetSchema.index({ userId: 1, month: 1 }, { unique: true });
const Budget = mongoose.model('Budget', budgetSchema);

// ─── BILL SCHEMA ─────────────────────────────────────────────────────────────
const billSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  total:   { type: Number, required: true },
  paidBy:  { type: String, required: true },
  people:  { type: [String], required: true },
  shares:  { type: Map, of: Number },         // { "Arjun": 400, "Priya": 400 }
  method:  { type: String, default: 'equal' },
  date:    { type: Date, default: Date.now },
});
const Bill = mongoose.model('Bill', billSchema);

// ─── AUTHENTICATION MIDDLEWARE ────────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
    req.userId = user.userId;
    next();
  });
}

// ─── ROUTES: AUTHENTICATION ───────────────────────────────────────────────────

// POST signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ userName: name, email, password: hashedPassword });
    const saved = await user.save();
    
    const token = jwt.sign({ userId: saved._id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ 
      success: true, 
      data: { userId: saved._id, token, userName: saved.userName } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ 
      success: true, 
      data: { userId: user._id, token, userName: user.userName } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ROUTES: EXPENSES ─────────────────────────────────────────────────────────

// GET all expenses (with optional filters)
// Query params: cat, pay, pri, month, search, sort
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { cat, pay, pri, month, search, sort } = req.query;
    const query = { userId: req.userId };
    if (cat)    query.cat = cat;
    if (pay)    query.pay = pay;
    if (pri)    query.pri = pri;
    if (month)  query.date = { $regex: `^${month}` };    // "2026-04"
    if (search) query.$or = [
      { desc: { $regex: search, $options: 'i' } },
      { tags: { $elemMatch: { $regex: search, $options: 'i' } } },
    ];

    const sortMap = {
      'date-desc': { date: -1 },
      'date-asc':  { date:  1 },
      'amt-desc':  { amt:  -1 },
      'amt-asc':   { amt:   1 },
    };
    const sortObj = sortMap[sort] || { date: -1 };

    const expenses = await Expense.find(query).sort(sortObj);
    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single expense
app.get('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense || expense.userId.toString() !== req.userId) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create expense
app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expense = new Expense({ ...req.body, userId: req.userId });
    const saved   = await expense.save();
    
    // Check if budget is exceeded after adding expense
    const expenseMonth = saved.date.substring(0, 7); // "YYYY-MM"
    const budget = await Budget.findOne({ userId: req.userId, month: expenseMonth });
    
    if (budget) {
      const expenses = await Expense.find({ userId: req.userId, date: { $regex: `^${expenseMonth}` } });
      const totalSpent = expenses.reduce((sum, e) => sum + e.amt, 0);
      
      if (totalSpent > budget.amount) {
        const user = await User.findById(req.userId);
        if (user && user.email) {
          const exceeded = totalSpent - budget.amount;
          const categorySpent = {};
          expenses.forEach(exp => {
            categorySpent[exp.cat] = (categorySpent[exp.cat] || 0) + exp.amt;
          });
          
          const categoryBreakdown = Object.entries(categorySpent)
            .map(([cat, amt]) => `<li><strong>${cat}:</strong> ₹${amt.toFixed(2)}</li>`)
            .join('');
          
          const emailContent = `
            <h2 style="color: #A32D2D;">🚨 Budget Alert - Limit Exceeded!</h2>
            <p>Hi <strong>${user.userName}</strong>,</p>
            <p>Your monthly budget for <strong>${expenseMonth}</strong> has been exceeded.</p>
            
            <h3 style="color: #333;">Budget Overview:</h3>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr style="background: #f0f0f0;">
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Budget Limit:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px;">₹${budget.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Total Spent:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px; color: #A32D2D;"><strong>₹${totalSpent.toFixed(2)}</strong></td>
              </tr>
              <tr style="background: #FFE6E6;">
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Exceeded by:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px; color: #A32D2D;"><strong>₹${exceeded.toFixed(2)}</strong></td>
              </tr>
            </table>
            
            <h3 style="color: #333;">Spending by Category:</h3>
            <ul style="line-height: 1.8;">
              ${categoryBreakdown}
            </ul>
            
            <p style="margin-top: 20px; padding: 15px; background: #FFF3CD; border-left: 4px solid #FFC107;">
              <strong>💡 Recommendation:</strong> Review your expenses and consider adjusting your budget if needed. Check your recent transactions to identify areas for savings.
            </p>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated alert from FinTrack Pro. Please do not reply to this email.
            </p>
          `;
          
          transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `🚨 Budget Exceeded Alert - ${expenseMonth}`,
            html: emailContent,
          }, (err) => {
            if (err) console.error('Email send error:', err);
            else console.log('Budget exceeded alert sent to', user.email);
          });
        }
      }
    }
    
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update expense
app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense || expense.userId.toString() !== req.userId) return res.status(404).json({ success: false, message: 'Not found' });
    Object.assign(expense, req.body);
    const updated = await expense.save();
    
    // Check if budget is exceeded after updating expense
    const expenseMonth = updated.date.substring(0, 7); // "YYYY-MM"
    const budget = await Budget.findOne({ userId: req.userId, month: expenseMonth });
    
    if (budget) {
      const expenses = await Expense.find({ userId: req.userId, date: { $regex: `^${expenseMonth}` } });
      const totalSpent = expenses.reduce((sum, e) => sum + e.amt, 0);
      
      if (totalSpent > budget.amount) {
        const user = await User.findById(req.userId);
        if (user && user.email) {
          const exceeded = totalSpent - budget.amount;
          const categorySpent = {};
          expenses.forEach(exp => {
            categorySpent[exp.cat] = (categorySpent[exp.cat] || 0) + exp.amt;
          });
          
          const categoryBreakdown = Object.entries(categorySpent)
            .map(([cat, amt]) => `<li><strong>${cat}:</strong> ₹${amt.toFixed(2)}</li>`)
            .join('');
          
          const emailContent = `
            <h2 style="color: #A32D2D;">🚨 Budget Alert - Limit Exceeded!</h2>
            <p>Hi <strong>${user.userName}</strong>,</p>
            <p>Your monthly budget for <strong>${expenseMonth}</strong> has been exceeded.</p>
            
            <h3 style="color: #333;">Budget Overview:</h3>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr style="background: #f0f0f0;">
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Budget Limit:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px;">₹${budget.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Total Spent:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px; color: #A32D2D;"><strong>₹${totalSpent.toFixed(2)}</strong></td>
              </tr>
              <tr style="background: #FFE6E6;">
                <td style="border: 1px solid #ddd; padding: 10px;"><strong>Exceeded by:</strong></td>
                <td style="border: 1px solid #ddd; padding: 10px; color: #A32D2D;"><strong>₹${exceeded.toFixed(2)}</strong></td>
              </tr>
            </table>
            
            <h3 style="color: #333;">Spending by Category:</h3>
            <ul style="line-height: 1.8;">
              ${categoryBreakdown}
            </ul>
            
            <p style="margin-top: 20px; padding: 15px; background: #FFF3CD; border-left: 4px solid #FFC107;">
              <strong>💡 Recommendation:</strong> Review your expenses and consider adjusting your budget if needed. Check your recent transactions to identify areas for savings.
            </p>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This is an automated alert from FinTrack Pro. Please do not reply to this email.
            </p>
          `;
          
          transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `🚨 Budget Exceeded Alert - ${expenseMonth}`,
            html: emailContent,
          }, (err) => {
            if (err) console.error('Email send error:', err);
            else console.log('Budget exceeded alert sent to', user.email);
          });
        }
      }
    }
    
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense || expense.userId.toString() !== req.userId) return res.status(404).json({ success: false, message: 'Not found' });
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ROUTES: ANALYTICS ────────────────────────────────────────────────────────

// GET monthly summary
app.get('/api/analytics/monthly', authenticateToken, async (req, res) => {
  try {
    const summary = await Expense.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: { $substr: ['$date', 0, 7] }, total: { $sum: '$amt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET category summary
app.get('/api/analytics/categories', authenticateToken, async (req, res) => {
  try {
    const { month } = req.query;
    const matchStage = month 
      ? { $match: { userId: mongoose.Types.ObjectId(req.userId), date: { $regex: `^${month}` } } } 
      : { $match: { userId: mongoose.Types.ObjectId(req.userId) } };
    const summary = await Expense.aggregate([
      matchStage,
      { $group: { _id: '$cat', total: { $sum: '$amt' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET priority breakdown
app.get('/api/analytics/priority', authenticateToken, async (req, res) => {
  try {
    const summary = await Expense.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: '$pri', total: { $sum: '$amt' }, count: { $sum: 1 } } }
    ]);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET payment method breakdown
app.get('/api/analytics/payments', authenticateToken, async (req, res) => {
  try {
    const summary = await Expense.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: '$pay', total: { $sum: '$amt' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET prediction — 3-month rolling average
app.get('/api/analytics/predict', authenticateToken, async (req, res) => {
  try {
    const summary = await Expense.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: { $substr: ['$date', 0, 7] }, total: { $sum: '$amt' } } },
      { $sort: { _id: -1 } },
      { $limit: 3 }
    ]);
    const avg = summary.length ? Math.round(summary.reduce((a,m) => a + m.total, 0) / summary.length) : 0;
    res.json({ success: true, data: { predictedNextMonth: avg, basedOn: summary } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ROUTES: BUDGET ───────────────────────────────────────────────────────────

// GET budget for a month
app.get('/api/budget/:month', authenticateToken, async (req, res) => {
  try {
    const budget = await Budget.findOne({ userId: req.userId, month: req.params.month });
    const user = await User.findById(req.userId);
    res.json({ success: true, data: budget || { month: req.params.month, amount: user?.budget || 10000 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / PUT set budget (with budget exceeded check)
app.post('/api/budget', authenticateToken, async (req, res) => {
  try {
    const { month, amount } = req.body;
    const budget = await Budget.findOneAndUpdate(
      { userId: req.userId, month },
      { userId: req.userId, month, amount, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    
    // Check if budget is exceeded and send email reminder
    const expenses = await Expense.find({ userId: req.userId, date: { $regex: `^${month}` } });
    const totalSpent = expenses.reduce((sum, e) => sum + e.amt, 0);
    
    if (totalSpent > amount) {
      const user = await User.findById(req.userId);
      if (user && user.email) {
        const exceeded = totalSpent - amount;
        const emailContent = `
          <h2>Budget Alert</h2>
          <p>Hi ${user.userName},</p>
          <p>Your monthly budget has been exceeded!</p>
          <p><strong>Month:</strong> ${month}</p>
          <p><strong>Budget:</strong> ₹${amount}</p>
          <p><strong>Spent:</strong> ₹${totalSpent}</p>
          <p><strong>Exceeded by:</strong> ₹${exceeded}</p>
          <p>Please review your expenses and consider adjusting your budget.</p>
        `;
        
        transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: `Budget Alert - ${month}`,
          html: emailContent,
        }, (err) => {
          if (err) console.error('Email send error:', err);
          else console.log('Budget reminder sent to', user.email);
        });
      }
    }
    
    res.json({ success: true, data: budget });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── ROUTES: BILL SPLITTER ────────────────────────────────────────────────────

// GET all bills
app.get('/api/bills', async (req, res) => {
  try {
    const bills = await Bill.find().sort({ date: -1 }).limit(20);
    res.json({ success: true, data: bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create bill
app.post('/api/bills', async (req, res) => {
  try {
    const bill  = new Bill(req.body);
    const saved = await bill.save();
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE bill
app.delete('/api/bills/:id', async (req, res) => {
  try {
    await Bill.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

// Catch-all — serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './frontend/index.html'));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 FinTrack Pro server running on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
});
