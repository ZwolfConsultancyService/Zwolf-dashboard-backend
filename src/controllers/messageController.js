import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Client from "../models/Client.js";
import imagekit, { toFile } from "../config/imagekit.js";
import {
  emitToUser,
  emitToClient,
  isUserOnline,
  isClientOnline,
} from "../../socket.js";

import {
  sendPushToEmployee,
  sendPushToClient,
} from "../utils/pushNotification.js";
/* =========================================================
   HELPERS
========================================================= */
const getAttachmentType = (mimeType = "") => {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation") ||
    mimeType === "text/plain"
  ) {
    return "document";
  }

  return "file";
};

const isSameId = (a, b) => {
  if (!a || !b) return false;
  return String(a) === String(b);
};

const getPagination = (req) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const paginatedResponse = (data, total, page, limit) => ({
  data,
  pagination: {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  },
});

/* =========================================================
   CONVERSATION ACCESS
========================================================= */

// const canAccessConversation = async (conversation, user) => {
//   if (!conversation || !user) return false;

//   /* -----------------------------
//      MANAGER
//   ----------------------------- */

//   if (user.role === "manager") {
//     return (
//       isSameId(conversation.manager, user._id) ||
//       isSameId(conversation.employee, user._id)
//     );
//   }

//   /* -----------------------------
//      SALES
//   ----------------------------- */

//   if (user.role === "sales") {
//     // Sales can access:
//     // 1. Manager conversation where sales is employee
//     // 2. Client conversations where sales is assigned

//     return (
//       isSameId(conversation.employee, user._id) ||
//       isSameId(conversation.sales, user._id)
//     );
//   }

//   /* -----------------------------
//      DEVELOPER
//   ----------------------------- */

//   if (user.role === "developer") {
//     // Developer can only talk to manager
//     return isSameId(conversation.employee, user._id);
//   }

//   return false;
// };

const canAccessConversation = async (conversation, user, client) => {
  if (!conversation) return false;

  /* =====================================================
     CLIENT
  ===================================================== */

  if (client) {
    if (conversation.type !== "client") {
      return false;
    }

    if (!conversation.client) {
      return false;
    }

    // Client can only access its own conversations
    if (!isSameId(conversation.client, client._id)) {
      return false;
    }

    // Client can only have conversation with:
    // 1. Assigned Sales
    // 2. Assigned Sales' Reporting Manager

    const assignedSales = await User.findById(
      client.assignedSales
    ).select("reportingManager role isActive");

    if (!assignedSales) {
      return false;
    }

    // Client ↔ Sales
    if (
      isSameId(conversation.sales, assignedSales._id)
    ) {
      return true;
    }

    // Client ↔ Manager
    if (conversation.manager) {
      return isSameId(
        conversation.manager,
        assignedSales.reportingManager
      );
    }

    return false;
  }

  /* =====================================================
     USER
  ===================================================== */

  if (!user) return false;

  /* -----------------------------
     MANAGER
  ----------------------------- */

  if (user.role === "manager") {
    return (
      isSameId(conversation.manager, user._id) ||
      isSameId(conversation.employee, user._id) ||
      isSameId(conversation.sales, user._id)
    );
  }

  /* -----------------------------
     SALES
  ----------------------------- */

  if (user.role === "sales") {
    return (
      isSameId(conversation.employee, user._id) ||
      isSameId(conversation.sales, user._id)
    );
  }

  /* -----------------------------
     DEVELOPER
  ----------------------------- */

  if (user.role === "developer") {
    return isSameId(conversation.employee, user._id);
  }

  return false;
};
/* =========================================================
   GET /api/messages/conversations
   GET ALL USER CONVERSATIONS
========================================================= */

export const getConversations = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    let filter = {
      isActive: true,
    };
/* -----------------------------------------
   CLIENT
   Client sees only:
   - Client ↔ Assigned Sales
   - Client ↔ Assigned Manager
----------------------------------------- */

if (req.client) {
  filter.type = "client";
  filter.client = req.client._id;
}
    /* -----------------------------------------
       MANAGER
       Manager sees:
       - Manager ↔ Employee
       - Manager ↔ Client
    ----------------------------------------- */

   else if (req.user.role === "manager") {
      filter.$or = [
        {
          manager: req.user._id,
        },
        {
          employee: req.user._id,
        },
      ];
    }

    /* -----------------------------------------
       SALES
       Sales sees:
       - Sales ↔ Manager
       - Sales ↔ Client
    ----------------------------------------- */

    else if (req.user.role === "sales") {
      filter.$or = [
        {
          employee: req.user._id,
        },
        {
          sales: req.user._id,
        },
      ];
    }

    /* -----------------------------------------
       DEVELOPER
       Developer sees:
       - Developer ↔ Manager
    ----------------------------------------- */

    else if (req.user.role === "developer") {
      filter.employee = req.user._id;
    }

    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access conversations",
      });
    }

    const total = await Conversation.countDocuments(filter);

    const conversations = await Conversation.find(filter)
      .populate(
        "manager",
        "name email phone role profileImage designation department"
      )
      .populate(
        "employee",
        "name email phone role profileImage designation department"
      )
      .populate(
        "sales",
        "name email phone role profileImage designation department"
      )
      .populate(
        "client",
        "clientName companyName email phone assignedSales"
      )
      .populate(
        "lastMessage",
        "sender receiver client text messageType attachments createdAt isEdited isDeleted"
      )
      .sort({
        lastMessageAt: -1,
        updatedAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      ...paginatedResponse(
        conversations,
        total,
        page,
        limit
      ),
    });
  } catch (error) {
    console.error("getConversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

/* =========================================================
   POST /api/messages/conversations
   CREATE OR GET CONVERSATION

   BODY:

   Manager -> Sales/Developer
   {
     type: "employee",
     employeeId: "SALES_OR_DEVELOPER_ID"
   }

   Sales/Developer -> Manager
   {
     type: "employee",
     employeeId: "MANAGER_ID"
   }

   Manager/Sales -> Client
   {
     type: "client",
     clientId: "CLIENT_ID"
   }
========================================================= */

export const getOrCreateConversation = async (req, res) => {
  try {
    const { type, employeeId, clientId } = req.body;

    /* =====================================================
       EMPLOYEE CONVERSATION

       This handles:

       Manager ↔ Sales
       Manager ↔ Developer
    ===================================================== */

  if (type === "employee") {
  let managerId;
  let employeeUserId;

  /* -----------------------------------------
     MANAGER STARTS CHAT
     Manager -> Sales / Developer
  ----------------------------------------- */

  if (req.user.role === "manager") {
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "employeeId is required",
      });
    }

    const targetUser = await User.findById(employeeId).select(
      "name email phone role profileImage designation department isActive"
    );

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!targetUser.isActive) {
      return res.status(400).json({
        success: false,
        message: "This user is inactive",
      });
    }

    if (isSameId(req.user._id, targetUser._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot create a conversation with yourself",
      });
    }

    if (!["sales", "developer"].includes(targetUser.role)) {
      return res.status(403).json({
        success: false,
        message:
          "Manager can only start employee conversations with Sales or Developer",
      });
    }

    managerId = req.user._id;
    employeeUserId = targetUser._id;
  }

  /* -----------------------------------------
     SALES STARTS CHAT
     Sales -> Assigned Manager

     employeeId is NOT required.
     reportingManager se manager milega.
  ----------------------------------------- */

  else if (req.user.role === "sales") {
    const salesUser = await User.findById(req.user._id)
      .select("name email role reportingManager isActive")
      .populate(
        "reportingManager",
        "name email phone role profileImage designation department isActive"
      );

    if (!salesUser) {
      return res.status(404).json({
        success: false,
        message: "Sales user not found",
      });
    }

    if (!salesUser.reportingManager) {
      return res.status(400).json({
        success: false,
        message:
          "No Manager is assigned to this Sales user. Please assign a reporting manager first.",
      });
    }

    if (!salesUser.reportingManager.isActive) {
      return res.status(400).json({
        success: false,
        message: "Your assigned Manager is inactive",
      });
    }

    if (salesUser.reportingManager.role !== "manager") {
      return res.status(400).json({
        success: false,
        message: "Invalid reporting manager assigned",
      });
    }

    managerId = salesUser.reportingManager._id;
    employeeUserId = req.user._id;
  }

  /* -----------------------------------------
     DEVELOPER STARTS CHAT
     Developer -> Assigned Manager
  ----------------------------------------- */

  else if (req.user.role === "developer") {
    const developerUser = await User.findById(req.user._id)
      .select("name email role reportingManager isActive")
      .populate(
        "reportingManager",
        "name email phone role profileImage designation department isActive"
      );

    if (!developerUser) {
      return res.status(404).json({
        success: false,
        message: "Developer user not found",
      });
    }

    if (!developerUser.reportingManager) {
      return res.status(400).json({
        success: false,
        message:
          "No Manager is assigned to this Developer. Please assign a reporting manager first.",
      });
    }

    if (!developerUser.reportingManager.isActive) {
      return res.status(400).json({
        success: false,
        message: "Your assigned Manager is inactive",
      });
    }

    if (developerUser.reportingManager.role !== "manager") {
      return res.status(400).json({
        success: false,
        message: "Invalid reporting manager assigned",
      });
    }

    managerId = developerUser.reportingManager._id;
    employeeUserId = req.user._id;
  }

  else {
    return res.status(403).json({
      success: false,
      message:
        "You are not allowed to create employee conversations",
    });
  }

  /* -----------------------------------------
     CHECK EXISTING CONVERSATION
  ----------------------------------------- */

  let conversation = await Conversation.findOne({
    type: "employee",
    manager: managerId,
    employee: employeeUserId,
    isActive: true,
  });

  /* -----------------------------------------
     CREATE IF NOT EXISTS
  ----------------------------------------- */

  if (!conversation) {
    conversation = await Conversation.create({
      type: "employee",
      manager: managerId,
      employee: employeeUserId,
      isActive: true,
      unreadCount: 0,
    });
  }

  /* -----------------------------------------
     POPULATE
  ----------------------------------------- */

  conversation = await Conversation.findById(
    conversation._id
  )
    .populate(
      "manager",
      "name email phone role profileImage designation department"
    )
    .populate(
      "employee",
      "name email phone role profileImage designation department"
    )
    .populate(
      "sales",
      "name email phone role profileImage designation department"
    )
    .populate(
      "client",
      "clientName companyName email phone assignedSales"
    )
    .populate(
      "lastMessage",
      "sender receiver client text messageType attachments createdAt isEdited isDeleted"
    );

  return res.status(200).json({
    success: true,
    data: conversation,
  });
}

    /* =====================================================
       CLIENT CONVERSATION

       Manager -> Client
       Sales -> Client
    ===================================================== */

    if (type === "client") {
      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "clientId is required",
        });
      }

      const client = await Client.findById(clientId).select(
        "clientName companyName email phone assignedSales clientStatus"
      );

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found",
        });
      }

      /* -----------------------------------------
         ONLY MANAGER OR SALES
      ----------------------------------------- */

      if (!["manager", "sales"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Only Manager or Sales can communicate with clients",
        });
      }

      /* -----------------------------------------
         SALES CAN ONLY TALK TO ASSIGNED CLIENT
      ----------------------------------------- */

      if (
        req.user.role === "sales" &&
        !isSameId(client.assignedSales, req.user._id)
      ) {
        return res.status(403).json({
          success: false,
          message: "This client is not assigned to you",
        });
      }

      let conversation;

      /* -----------------------------------------
         MANAGER ↔ CLIENT
      ----------------------------------------- */

      if (req.user.role === "manager") {
        conversation = await Conversation.findOne({
          type: "client",
          manager: req.user._id,
          client: client._id,
          isActive: true,
        });

        if (!conversation) {
          conversation = await Conversation.create({
            type: "client",
            manager: req.user._id,
            client: client._id,
            isActive: true,
            unreadCount: 0,
          });
        }
      }

      /* -----------------------------------------
         SALES ↔ CLIENT
      ----------------------------------------- */

      if (req.user.role === "sales") {
        conversation = await Conversation.findOne({
          type: "client",
          sales: req.user._id,
          client: client._id,
          isActive: true,
        });

        if (!conversation) {
          conversation = await Conversation.create({
            type: "client",
            sales: req.user._id,
            client: client._id,
            isActive: true,
            unreadCount: 0,
          });
        }
      }

      /* -----------------------------------------
         POPULATE
      ----------------------------------------- */

      conversation = await Conversation.findById(
        conversation._id
      )
        .populate(
          "manager",
          "name email phone role profileImage designation department"
        )
        .populate(
          "employee",
          "name email phone role profileImage designation department"
        )
        .populate(
          "sales",
          "name email phone role profileImage designation department"
        )
        .populate(
          "client",
          "clientName companyName email phone assignedSales"
        )
        .populate(
          "lastMessage",
          "sender receiver client text messageType attachments createdAt isEdited isDeleted"
        );

      return res.status(200).json({
        success: true,
        data: conversation,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid conversation type",
    });
  } catch (error) {
    console.error("getOrCreateConversation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create/get conversation",
      error: error.message,
    });
  }
};

/* =========================================================
   GET /api/messages/conversations/:conversationId
   GET MESSAGES
========================================================= */

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page, limit, skip } = getPagination(req);

    const conversation = await Conversation.findById(
      conversationId
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const allowed = await canAccessConversation(
      conversation,
      req.user
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this conversation",
      });
    }

    const filter = {
      conversationId,
    };

    const total = await Message.countDocuments(filter);

    const messages = await Message.find(filter)
      .populate(
        "sender",
        "name email phone role profileImage designation department"
      )
      .populate(
        "receiver",
        "name email phone role profileImage designation department"
      )
      .populate(
        "client",
        "clientName companyName email phone"
      )
      .populate(
        "replyTo",
        "sender text messageType createdAt"
      )
      .sort({
        createdAt: 1,
      })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      ...paginatedResponse(
        messages,
        total,
        page,
        limit
      ),
    });
  } catch (error) {
    console.error("getMessages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

/* =========================================================
   POST /api/messages
   SEND MESSAGE
========================================================= */

export const sendMessage = async (req, res) => {
  try {
    const {
      conversationId,
      text,
      messageType = "text",
      attachments = [],
      replyTo = null,
    } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    /* -----------------------------------------
       VALIDATE CONTENT
    ----------------------------------------- */

    const cleanText = typeof text === "string" ? text.trim() : "";

    if (
      messageType === "text" &&
      !cleanText &&
      (!attachments || attachments.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    /* -----------------------------------------
       GET CONVERSATION
    ----------------------------------------- */

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    /* -----------------------------------------
       ACCESS CHECK
    ----------------------------------------- */

    const allowed = await canAccessConversation(conversation, req.user);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to send messages in this conversation",
      });
    }

    /* -----------------------------------------
       FIND RECEIVER
    ----------------------------------------- */

    let receiver = null;

    if (conversation.type === "employee") {
      if (isSameId(req.user._id, conversation.manager)) {
        receiver = conversation.employee;
      } else if (isSameId(req.user._id, conversation.employee)) {
        receiver = conversation.manager;
      } else {
        return res.status(403).json({
          success: false,
          message: "Invalid conversation participant",
        });
      }
    }

    /* -----------------------------------------
       CLIENT CONVERSATION
    ----------------------------------------- */

    let client = null;

    if (conversation.type === "client") {
      client = conversation.client;
    }

    /* -----------------------------------------
       CREATE MESSAGE
    ----------------------------------------- */

    const message = await Message.create({
      conversationId: conversation._id,
      sender: req.user._id,
      receiver,
      client,
      text: cleanText,
      attachments: Array.isArray(attachments) ? attachments : [],
      messageType,
      replyTo: replyTo || null,
    });

    /* -----------------------------------------
       UPDATE CONVERSATION
    ----------------------------------------- */

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = Number(conversation.unreadCount || 0) + 1;

    await conversation.save();

    /* -----------------------------------------
       POPULATE MESSAGE
    ----------------------------------------- */

    const populatedMessage = await Message.findById(message._id)
      .populate(
        "sender",
        "name email phone role profileImage designation department"
      )
      .populate(
        "receiver",
        "name email phone role profileImage designation department"
      )
      .populate("client", "clientName companyName email phone")
      .populate("replyTo", "sender text messageType createdAt");

    /* =========================================
       🔔 REAL-TIME + PUSH NOTIFICATION
    ========================================= */

    try {
      const senderName = req.user?.name || "Someone";

      const msgText =
        populatedMessage.text ||
        (populatedMessage.messageType === "image" && "📷 Photo") ||
        (populatedMessage.messageType === "video" && "🎥 Video") ||
        (populatedMessage.messageType === "audio" && "🎤 Audio") ||
        (populatedMessage.messageType === "document" && "📄 Document") ||
        "📎 Attachment";

      /* -------- Employee receiver (Manager ↔ Sales/Dev) -------- */

      if (receiver) {
        const receiverId = String(receiver);
        const online = isUserOnline(receiverId);

        emitToUser(receiverId, "new-message", {
          conversationId: String(conversation._id),
          message: populatedMessage,
          senderName,
        });

        if (!online) {
          sendPushToEmployee(receiverId, {
            title: senderName,
            body: msgText,
            conversationId: String(conversation._id),
            url: `/messages?c=${conversation._id}`,
            tag: `msg-${conversation._id}`,
          }).catch((e) => console.error("push emp err:", e));
        }
      }

      /* -------- Client receiver (employee → client) -------- */

      if (conversation.type === "client" && conversation.client) {
        const clientId = String(conversation.client);
        const online = isClientOnline(clientId);

        emitToClient(clientId, "new-message", {
          conversationId: String(conversation._id),
          message: populatedMessage,
          senderName,
        });

        if (!online) {
          sendPushToClient(clientId, {
            title: senderName,
            body: msgText,
            conversationId: String(conversation._id),
            url: `/client/messages?c=${conversation._id}`,
            tag: `msg-${conversation._id}`,
          }).catch((e) => console.error("push client err:", e));
        }
      }
    } catch (notifErr) {
      console.error("notification err:", notifErr);
    }

    /* ========================================= */

    return res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error("sendMessage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

/* =========================================================
   PATCH /api/messages/conversations/:conversationId/read
========================================================= */

export const markConversationAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const allowed = await canAccessConversation(conversation, req.user);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this conversation",
      });
    }

    /* -----------------------------------------
       Mark unread messages as read
    ----------------------------------------- */

    await Message.updateMany(
      {
        conversationId: conversation._id,
        sender: { $ne: req.user._id },
        readAt: null,
        isDeleted: { $ne: true },
      },
      {
        $set: { readAt: new Date() },
      }
    );

    conversation.unreadCount = 0;

    await conversation.save();

    /* =========================================
       🔔 NOTIFY SENDER THAT MESSAGE WAS SEEN
    ========================================= */

    try {
      if (conversation.type === "employee") {
        const otherUserId = isSameId(req.user._id, conversation.manager)
          ? conversation.employee
          : conversation.manager;

        if (otherUserId) {
          emitToUser(String(otherUserId), "messages-seen", {
            conversationId: String(conversation._id),
            by: String(req.user._id),
          });
        }
      }

      if (conversation.type === "client" && conversation.client) {
        emitToClient(String(conversation.client), "messages-seen", {
          conversationId: String(conversation._id),
          by: String(req.user._id),
        });
      }
    } catch (notifErr) {
      console.error("seen notif err:", notifErr);
    }

    /* ========================================= */

    return res.json({
      success: true,
      message: "Conversation marked as read",
    });
  } catch (error) {
    console.error("markConversationAsRead error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark conversation as read",
      error: error.message,
    });
  }
};
/* =========================================================
   PATCH /api/messages/:id
   EDIT OWN MESSAGE
========================================================= */

export const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message text is required",
      });
    }

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (!isSameId(message.sender, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages",
      });
    }

    if (message.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Deleted message cannot be edited",
      });
    }

    message.text = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    const updatedMessage = await Message.findById(
      message._id
    )
      .populate(
        "sender",
        "name email phone role profileImage designation department"
      )
      .populate(
        "receiver",
        "name email phone role profileImage designation department"
      )
      .populate(
        "client",
        "clientName companyName email phone"
      );

    return res.json({
      success: true,
      data: updatedMessage,
    });
  } catch (error) {
    console.error("editMessage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to edit message",
      error: error.message,
    });
  }
};

/* =========================================================
   DELETE /api/messages/:id
   DELETE OWN MESSAGE
========================================================= */

export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await Message.findById(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (!isSameId(message.sender, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages",
      });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.text = "";

    await message.save();

    return res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("deleteMessage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error.message,
    });
  }
};




/* =========================================================
   UPLOAD EMPLOYEE MESSAGE ATTACHMENT

   POST /api/messages/upload
========================================================= */

/* =========================================================
   UPLOAD EMPLOYEE MESSAGE ATTACHMENT

   POST /api/messages/upload
========================================================= */

/* =========================================================
   UPLOAD EMPLOYEE / CLIENT-CONVERSATION ATTACHMENT

   POST /api/messages/upload

   Used by authenticated employees for:

   Manager ↔ Developer
   Manager ↔ Sales
   Manager ↔ Client
   Sales ↔ Client
   etc.
========================================================= */

export const uploadMessageAttachment = async (req, res) => {
  console.log("\n==============================================");
  console.log("MESSAGE ATTACHMENT UPLOAD STARTED");
  console.log("==============================================");

  try {
    const { conversationId } = req.body;

    /* =====================================================
       VALIDATE CONVERSATION ID
    ===================================================== */

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    /* =====================================================
       VALIDATE FILE
    ===================================================== */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a file",
      });
    }

    console.log("USER:", {
      id: req.user?._id,
      name: req.user?.name,
      role: req.user?.role,
    });

    console.log("CONVERSATION ID:", conversationId);

    console.log("FILE:", {
      name: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    /* =====================================================
       GET CONVERSATION
    ===================================================== */

    const conversation =
      await Conversation.findById(
        conversationId
      ).select(
        "type manager employee sales client isActive"
      );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    console.log("CONVERSATION:", {
      id: String(conversation._id),
      type: conversation.type,
      manager: conversation.manager
        ? String(conversation.manager)
        : null,
      employee: conversation.employee
        ? String(conversation.employee)
        : null,
      sales: conversation.sales
        ? String(conversation.sales)
        : null,
      client: conversation.client
        ? String(conversation.client)
        : null,
      isActive: conversation.isActive,
    });

    /* =====================================================
       ACTIVE CHECK
    ===================================================== */

    if (conversation.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This conversation is inactive",
      });
    }

    /* =====================================================
       EMPLOYEE ACCESS CHECK

       IMPORTANT:

       This endpoint is protected by:

       protect

       Therefore req.user is an employee.

       It can handle both:

       type: employee
       type: client
    ===================================================== */

    const allowed = await canAccessConversation(
      conversation,
      req.user
    );

    console.log(
      "MESSAGE UPLOAD ACCESS:",
      allowed
    );

    if (!allowed) {
      console.log(
        "MESSAGE UPLOAD ACCESS DENIED"
      );

      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to upload files in this conversation",
      });
    }

    /* =====================================================
       CONVERT FILE FOR IMAGEKIT
    ===================================================== */

    console.log(
      "Converting file for ImageKit..."
    );

    const imageKitFile = await toFile(
      req.file.buffer,
      req.file.originalname
    );

    /* =====================================================
       UPLOAD TO IMAGEKIT
    ===================================================== */

    console.log(
      "Uploading file to ImageKit..."
    );

    const uploadResponse =
      await imagekit.files.upload({
        file: imageKitFile,

        fileName:
          req.file.originalname,

        folder:
          "/zwolf/messages",

        useUniqueFileName:
          true,
      });

    console.log(
      "ImageKit upload successful:",
      uploadResponse.url
    );

    /* =====================================================
       ATTACHMENT TYPE
    ===================================================== */

    const attachmentType =
      getAttachmentType(
        req.file.mimetype
      );

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(201).json({
      success: true,

      data: {
        fileId:
          uploadResponse.fileId || "",

        url:
          uploadResponse.url,

        name:
          req.file.originalname,

        type:
          attachmentType,

        mimeType:
          req.file.mimetype,

        size:
          req.file.size,
      },
    });
  } catch (error) {
    console.error(
      "MESSAGE ATTACHMENT UPLOAD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to upload attachment",

      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| Clear Conversation Messages
|--------------------------------------------------------------------------
*/

export const clearConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID is required",
      });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Employee authorization
    |--------------------------------------------------------------------------
    */

    const userId = String(req.user._id);

    let allowed = false;

    if (conversation.type === "employee") {
      allowed = await canAccessConversation(conversation, req.user);
    }

    if (conversation.type === "client") {
      allowed =
        String(conversation.manager || "") === userId ||
        String(conversation.sales || "") === userId ||
        String(conversation.employee || "") === userId;
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to clear this conversation",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Delete all messages
    |--------------------------------------------------------------------------
    */

    const deleteResult = await Message.deleteMany({
      conversationId: conversation._id,
    });

    /*
    |--------------------------------------------------------------------------
    | Reset conversation last message
    |--------------------------------------------------------------------------
    */

    conversation.lastMessage = null;
    conversation.lastMessageAt = null;
    conversation.unreadCount = 0;

    await conversation.save();

    /* =========================================
       🔔 NOTIFY OTHER SIDE (chat cleared)
    ========================================= */

    try {
      if (conversation.type === "employee") {
        const otherUserId = isSameId(req.user._id, conversation.manager)
          ? conversation.employee
          : conversation.manager;

        if (otherUserId) {
          emitToUser(String(otherUserId), "chat-cleared", {
            conversationId: String(conversation._id),
            by: String(req.user._id),
          });
        }
      }

      if (conversation.type === "client" && conversation.client) {
        emitToClient(String(conversation.client), "chat-cleared", {
          conversationId: String(conversation._id),
          by: String(req.user._id),
        });
      }
    } catch (notifErr) {
      console.error("clear notif err:", notifErr);
    }

    /* ========================================= */

    return res.status(200).json({
      success: true,
      message: "Chat cleared successfully",
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error("CLEAR CONVERSATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to clear conversation",
      error:
        process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
};