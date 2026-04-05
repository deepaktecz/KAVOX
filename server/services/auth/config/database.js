'use strict';

const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

let isConnected = false;

async function connectDB() {
  if (isConnected) {
    logger.info('MongoDB: Using existing connection');
    return;
  }

  const uri = process.env.NODE_ENV === 'test'
    ? process.env.MONGO_URI_TEST
    : process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, MONGO_OPTIONS);
    isConnected = true;

    logger.info(`✅ MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      isConnected = true;
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      isConnected = false;
    });

  } catch (err) {
    logger.error('MongoDB connection failed:', err.message);
    throw err;
  }
}

async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB disconnected gracefully');
}

module.exports = { connectDB, disconnectDB };
