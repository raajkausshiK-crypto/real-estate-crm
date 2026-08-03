import express from 'express';
import cors from 'cors';
import { initDb } from '../server/src/config/database.js';
import authRoutes from '../server/src/routes/auth.js';
import leadRoutes from '../server/src/routes/leads.js';
import contactRoutes from '../server/src/routes/contacts.js';
import propertyRoutes from '../server/src/routes/properties.js';
import csvRoutes from '../server/src/routes/csv.js';
import integrationRoutes from '../server/src/routes/integrations.js';
import webhookRoutes from '../server/src/routes/webhooks.js';
import callRoutes from '../server/src/routes/calls.js';
import employeeRoutes from '../server/src/routes/employees.js';

const app = express();

app.use(cors());
app.use(express.json());

let dbReady = false;
const dbPromise = initDb().then(() => { dbReady = true; });

app.use(async (_req, _res, next) => {
  if (!dbReady) await dbPromise;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/employees', employeeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
