import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      trim: true,
      default: "",
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      trim: true,
      default: "",
    },

    type: {
      type: String,
      enum: [
        "image",
        "video",
        "audio",
        "document",
        "file",
      ],
      default: "file",
    },

    mimeType: {
      type: String,
      trim: true,
      default: "",
    },

    size: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
  index: true,
},
    senderClient: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Client",
  default: null,
  index: true,
},

senderType: {
  type: String,
  enum: ["employee", "client"],
  default: "employee",
  index: true,
},

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },

    text: {
      type: String,
      trim: true,
      default: "",
    },

    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    messageType: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "file",
        "mixed",
      ],
      default: "text",
    },

    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({
  conversationId: 1,
  createdAt: 1,
});

messageSchema.index({
  sender: 1,
  receiver: 1,
  createdAt: -1,
});

export default mongoose.model("Message", messageSchema);