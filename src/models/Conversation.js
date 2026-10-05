import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['employee', 'client'],
      required: true,
    },

    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    sales: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },

    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({
  manager: 1,
  employee: 1,
});

conversationSchema.index({
  manager: 1,
  client: 1,
});

conversationSchema.index({
  sales: 1,
  client: 1,
});

conversationSchema.index({
  lastMessageAt: -1,
});

export default mongoose.model('Conversation', conversationSchema);