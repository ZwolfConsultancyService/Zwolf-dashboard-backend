import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Client from "../models/Client.js";
import imagekit, { toFile } from "../config/imagekit.js";
import { emitToUser, isUserOnline } from "../../socket.js";
import { sendPushToEmployee } from "../utils/pushNotification.js";

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

/* =========================================================
   ID COMPARISON
========================================================= */

const isSameId = (a, b) => {
  if (!a || !b) {
    return false;
  }

  return String(a) === String(b);
};

/* =========================================================
   PAGINATION
========================================================= */

const getPagination = (req) => {
  const page = Math.max(
    Number(req.query.page) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number(req.query.limit) || 50,
      1
    ),
    100
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const paginatedResponse = (
  data,
  total,
  page,
  limit
) => ({
  data,
  pagination: {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  },
});

/* =========================================================
   GET CLIENT + ASSIGNED SALES + REPORTING MANAGER
========================================================= */

const getClientChatUsers = async (clientId) => {
  try {
    /* =====================================================
       GET CLIENT
    ===================================================== */

    const client = await Client.findById(clientId).select(
      "clientName companyName email phone assignedSales clientStatus"
    );

    if (!client) {
      return {
        error: "Client not found",
      };
    }

    /* =====================================================
       CHECK ASSIGNED SALES
    ===================================================== */

    if (!client.assignedSales) {
      return {
        error:
          "No Sales person is assigned to this client",
      };
    }

    /* =====================================================
       GET ASSIGNED SALES
    ===================================================== */

    const sales = await User.findById(
      client.assignedSales
    )
      .select(
        "name email phone role profileImage designation department reportingManager isActive"
      )
      .populate(
        "reportingManager",
        "name email phone role profileImage designation department isActive"
      );

    if (!sales) {
      return {
        error: "Assigned Sales person not found",
      };
    }

    /* =====================================================
       SALES ACTIVE CHECK
    ===================================================== */

    if (!sales.isActive) {
      return {
        error: "Assigned Sales person is inactive",
      };
    }

    /* =====================================================
       SALES ROLE CHECK
    ===================================================== */

    if (
      String(sales.role).toLowerCase() !==
      "sales"
    ) {
      return {
        error: "Assigned user is not a Sales person",
      };
    }

    /* =====================================================
       GET REPORTING MANAGER

       Manager is optional.

       Sales chat will work even if manager is null.
    ===================================================== */

    let manager = sales.reportingManager || null;

    if (manager) {
      if (!manager.isActive) {
        manager = null;
      } else if (
        String(manager.role).toLowerCase() !==
        "manager"
      ) {
        manager = null;
      }
    }

    return {
      client,
      sales,
      manager,
    };
  } catch (error) {
    console.error(
      "getClientChatUsers error:",
      error
    );

    return {
      error: "Failed to get client chat users",
    };
  }
};

/* =========================================================
   CLIENT CONVERSATION ACCESS
========================================================= */

const canClientAccessConversation = async (
  conversation,
  clientId
) => {
  try {
    /* =====================================================
       BASIC VALIDATION
    ===================================================== */

    if (!conversation) {
      return false;
    }

    if (conversation.type !== "client") {
      return false;
    }

    if (!conversation.client) {
      return false;
    }

    /* =====================================================
       CLIENT OWNERSHIP
    ===================================================== */

    if (
      !isSameId(
        conversation.client,
        clientId
      )
    ) {
      return false;
    }

    /* =====================================================
       GET CURRENT ASSIGNMENT
    ===================================================== */

    const chatUsers =
      await getClientChatUsers(clientId);

    if (
      !chatUsers ||
      chatUsers.error
    ) {
      return false;
    }

    const {
      sales,
      manager,
    } = chatUsers;

    /* =====================================================
       CLIENT → SALES
    ===================================================== */

    if (
      conversation.sales &&
      sales &&
      isSameId(
        conversation.sales,
        sales._id
      )
    ) {
      return true;
    }

    /* =====================================================
       CLIENT → MANAGER
    ===================================================== */

    if (
      conversation.manager &&
      manager &&
      isSameId(
        conversation.manager,
        manager._id
      )
    ) {
      return true;
    }

    /* =====================================================
       NOT ALLOWED

       This also automatically blocks old/stale
       conversations belonging to previous assignments.
    ===================================================== */

    return false;
  } catch (error) {
    console.error(
      "canClientAccessConversation error:",
      error
    );

    return false;
  }
};

/* =========================================================
   GET CLIENT CONVERSATIONS

   GET /api/client-messages/conversations
========================================================= */

export const getClientConversations = async (
  req,
  res
) => {
  try {
    const clientId = req.client._id;

    /* =====================================================
       GET CURRENT CHAT USERS
    ===================================================== */

    const chatUsers =
      await getClientChatUsers(
        clientId
      );

    if (
      !chatUsers ||
      chatUsers.error
    ) {
      return res.status(403).json({
        success: false,
        message:
          chatUsers?.error ||
          "Client chat access denied",
      });
    }

    const {
      client,
      sales,
      manager,
    } = chatUsers;

    /* =====================================================
       BUILD CURRENT USER CONDITIONS
    ===================================================== */

    const participantConditions = [];

    /* Assigned Sales */

    if (sales?._id) {
      participantConditions.push({
        sales: sales._id,
      });
    }

    /* Reporting Manager */

    if (manager?._id) {
      participantConditions.push({
        manager: manager._id,
      });
    }

    /* =====================================================
       NO PARTICIPANT
    ===================================================== */

    if (
      participantConditions.length === 0
    ) {
      return res.json({
        success: true,
        conversations: [],
        chatUsers: {
          client,
          sales,
          manager: null,
        },
      });
    }

    /* =====================================================
       GET ONLY CURRENT CONVERSATIONS
    ===================================================== */

    const conversations =
      await Conversation.find({
        type: "client",
        client: client._id,
        isActive: true,

        $or: participantConditions,
      })
        .populate(
          "sales",
          "name email phone role profileImage department designation"
        )
        .populate(
          "manager",
          "name email phone role profileImage department designation"
        )
        .populate({
          path: "lastMessage",
          select:
            "text sender senderClient senderType messageType attachments createdAt isEdited isDeleted readAt",
        })
        .sort({
          lastMessageAt: -1,
          updatedAt: -1,
        });

    return res.status(200).json({
      success: true,

      conversations,

      chatUsers: {
        client,
        sales,
        manager,
      },
    });
  } catch (error) {
    console.error(
      "GET CLIENT CONVERSATIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch client conversations",
      error: error.message,
    });
  }
};

/* =========================================================
   CREATE / GET CLIENT CONVERSATION

   POST /api/client-messages/conversations

   BODY:

   {
     "target": "sales"
   }

   OR

   {
     "target": "manager"
   }
========================================================= */

export const getOrCreateClientConversation =
  async (req, res) => {
    try {
      const {
        target,
      } = req.body;

      /* =====================================================
         VALIDATE TARGET
      ===================================================== */

      if (
        !["sales", "manager"].includes(
          target
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'target must be "sales" or "manager"',
        });
      }

      /* =====================================================
         GET CURRENT CHAT USERS
      ===================================================== */

      const chatUsers =
        await getClientChatUsers(
          req.client._id
        );

      if (
        !chatUsers ||
        chatUsers.error
      ) {
        return res.status(400).json({
          success: false,
          message:
            chatUsers?.error ||
            "Unable to find client chat users",
        });
      }

      const {
        client,
        sales,
        manager,
      } = chatUsers;

      let conversation = null;

      /* =====================================================
         CLIENT → SALES
      ===================================================== */

      if (target === "sales") {
        conversation =
          await Conversation.findOne({
            type: "client",

            client: client._id,

            sales: sales._id,

            isActive: true,
          });

        /* ===================================================
           CREATE NEW SALES CONVERSATION
        =================================================== */

        if (!conversation) {
          conversation =
            await Conversation.create({
              type: "client",

              client: client._id,

              sales: sales._id,

              manager: null,

              employee: null,

              lastMessage: null,

              lastMessageAt: null,

              unreadCount: 0,

              isActive: true,
            });
        }
      }

      /* =====================================================
         CLIENT → MANAGER
      ===================================================== */

      if (target === "manager") {
        /* ===================================================
           MANAGER REQUIRED
        =================================================== */

        if (!manager) {
          return res.status(400).json({
            success: false,
            message:
              "No active reporting Manager is assigned to your Sales person",
          });
        }

        /* ===================================================
           FIND EXISTING MANAGER CONVERSATION
        =================================================== */

        conversation =
          await Conversation.findOne({
            type: "client",

            client: client._id,

            manager: manager._id,

            isActive: true,
          });

        /* ===================================================
           CREATE NEW MANAGER CONVERSATION
        =================================================== */

        if (!conversation) {
          conversation =
            await Conversation.create({
              type: "client",

              client: client._id,

              manager: manager._id,

              sales: null,

              employee: null,

              lastMessage: null,

              lastMessageAt: null,

              unreadCount: 0,

              isActive: true,
            });
        }
      }

      /* =====================================================
         SAFETY CHECK
      ===================================================== */

      if (!conversation) {
        return res.status(400).json({
          success: false,
          message:
            "Unable to create conversation",
        });
      }

      /* =====================================================
         POPULATE CONVERSATION
      ===================================================== */

      const populatedConversation =
        await Conversation.findById(
          conversation._id
        )
          .populate(
            "manager",
            "name email phone role profileImage designation department isActive"
          )
          .populate(
            "sales",
            "name email phone role profileImage designation department isActive"
          )
          .populate(
            "client",
            "clientName companyName email phone assignedSales"
          )
          .populate(
            "lastMessage",
            "sender senderClient senderType receiver client text messageType attachments createdAt isEdited isDeleted readAt"
          );

      return res.status(200).json({
        success: true,
        data: populatedConversation,
      });
    } catch (error) {
      console.error(
        "getOrCreateClientConversation error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create/get client conversation",
        error: error.message,
      });
    }
  };

/* =========================================================
   GET CLIENT MESSAGES

   GET /api/client-messages/conversations/:conversationId
========================================================= */

export const getClientMessages =
  async (req, res) => {
    try {
      const {
        conversationId,
      } = req.params;

      const {
        page,
        limit,
        skip,
      } = getPagination(req);

      /* =====================================================
         GET CONVERSATION
      ===================================================== */

      const conversation =
        await Conversation.findById(
          conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      /* =====================================================
         ACCESS CHECK
      ===================================================== */

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to access this conversation",
        });
      }

      /* =====================================================
         MESSAGE FILTER
      ===================================================== */

      const filter = {
        conversationId:
          conversation._id,
      };

      /* =====================================================
         TOTAL
      ===================================================== */

      const total =
        await Message.countDocuments(
          filter
        );

      /* =====================================================
         GET MESSAGES
      ===================================================== */

      const messages =
        await Message.find(
          filter
        )
          .populate(
            "sender",
            "name email phone role profileImage designation department"
          )
          .populate(
            "senderClient",
            "clientName companyName email phone"
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
            "sender senderClient text messageType createdAt"
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
      console.error(
        "getClientMessages error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch client messages",
        error: error.message,
      });
    }
  };

/* =========================================================
   SEND CLIENT MESSAGE

   POST /api/client-messages
========================================================= */

/* =========================================================
   SEND CLIENT MESSAGE

   POST /api/client-messages
========================================================= */

export const sendClientMessage =
  async (req, res) => {
    try {
      const {
        conversationId,
        text,
        messageType = "text",
        attachments = [],
        replyTo = null,
      } = req.body;

      /* =====================================================
         VALIDATE CONVERSATION ID
      ===================================================== */

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message:
            "conversationId is required",
        });
      }

      /* =====================================================
         CLEAN TEXT
      ===================================================== */

      const cleanText =
        typeof text === "string"
          ? text.trim()
          : "";

      /* =====================================================
         EMPTY MESSAGE CHECK
      ===================================================== */

      if (
        messageType === "text" &&
        !cleanText &&
        (!Array.isArray(
          attachments
        ) ||
          attachments.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Message cannot be empty",
        });
      }

      /* =====================================================
         GET CONVERSATION
      ===================================================== */

      const conversation =
        await Conversation.findById(
          conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      /* =====================================================
         ACCESS CHECK
      ===================================================== */

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to send messages in this conversation",
        });
      }

      /* =====================================================
         FIND RECEIVER
      ===================================================== */

      let receiver = null;

      if (conversation.sales) {
        receiver =
          conversation.sales;
      } else if (
        conversation.manager
      ) {
        receiver =
          conversation.manager;
      }

      if (!receiver) {
        return res.status(400).json({
          success: false,
          message:
            "No valid receiver found",
        });
      }

      /* =====================================================
         CREATE MESSAGE
      ===================================================== */

      const message =
        await Message.create({
          conversationId:
            conversation._id,

          sender: null,

          senderClient:
            req.client._id,

          senderType:
            "client",

          receiver,

          client:
            conversation.client,

          text:
            cleanText,

          attachments:
            Array.isArray(
              attachments
            )
              ? attachments
              : [],

          messageType,

          replyTo:
            replyTo || null,
        });

      /* =====================================================
         UPDATE CONVERSATION
      ===================================================== */

      conversation.lastMessage =
        message._id;

      conversation.lastMessageAt =
        new Date();

      conversation.unreadCount =
        Number(
          conversation.unreadCount || 0
        ) + 1;

      await conversation.save();

      /* =====================================================
         POPULATE MESSAGE
      ===================================================== */

      const populatedMessage =
        await Message.findById(
          message._id
        )
          .populate(
            "sender",
            "name email phone role profileImage designation department"
          )
          .populate(
            "senderClient",
            "clientName companyName email phone"
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
            "sender senderClient text messageType createdAt"
          );

      /* =====================================================
         🔔 SOCKET + PUSH NOTIFICATION
      ===================================================== */

      try {
        const senderName =
          req.client?.clientName ||
          req.client?.companyName ||
          "Client";

        const msgText =
          populatedMessage.text ||
          (populatedMessage.messageType ===
            "image" &&
            "📷 Photo") ||
          (populatedMessage.messageType ===
            "video" &&
            "🎥 Video") ||
          (populatedMessage.messageType ===
            "audio" &&
            "🎤 Audio") ||
          (populatedMessage.messageType ===
            "document" &&
            "📄 Document") ||
          "📎 Attachment";

        const receiverId = String(receiver);
        const online = isUserOnline(receiverId);

        emitToUser(receiverId, "new-message", {
          conversationId: String(
            conversation._id
          ),
          message: populatedMessage,
          senderName,
        });

        if (!online) {
          sendPushToEmployee(receiverId, {
            title: senderName,
            body: msgText,
            conversationId: String(
              conversation._id
            ),
            url: `/messages?c=${conversation._id}`,
            tag: `msg-${conversation._id}`,
          }).catch((e) =>
            console.error(
              "client→emp push err:",
              e
            )
          );
        }
      } catch (notifErr) {
        console.error(
          "sendClientMessage notif err:",
          notifErr
        );
      }

      /* ===================================================== */

      return res.status(201).json({
        success: true,
        data:
          populatedMessage,
      });
    } catch (error) {
      console.error(
        "sendClientMessage error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to send client message",
        error: error.message,
      });
    }
  };
/* =========================================================
   MARK CLIENT CONVERSATION AS READ

   PATCH /api/client-messages/conversations/:conversationId/read
========================================================= */

/* =========================================================
   MARK CLIENT CONVERSATION AS READ

   PATCH /api/client-messages/conversations/:conversationId/read
========================================================= */

export const markClientConversationAsRead =
  async (req, res) => {
    try {
      const {
        conversationId,
      } = req.params;

      /* =====================================================
         GET CONVERSATION
      ===================================================== */

      const conversation =
        await Conversation.findById(
          conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      /* =====================================================
         ACCESS CHECK
      ===================================================== */

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to access this conversation",
        });
      }

      /* =====================================================
         MARK EMPLOYEE MESSAGES AS READ
      ===================================================== */

      await Message.updateMany(
        {
          conversationId:
            conversation._id,

          senderClient: {
            $ne:
              req.client._id,
          },

          readAt: null,

          isDeleted: {
            $ne: true,
          },
        },
        {
          $set: {
            readAt:
              new Date(),
          },
        }
      );

      /* =====================================================
         RESET UNREAD COUNT
      ===================================================== */

      conversation.unreadCount =
        0;

      await conversation.save();

      /* =====================================================
         🔔 NOTIFY EMPLOYEE (client ne seen kiya)
      ===================================================== */

      try {
        const otherUserId =
          conversation.sales ||
          conversation.manager;

        if (otherUserId) {
          emitToUser(
            String(otherUserId),
            "messages-seen",
            {
              conversationId: String(
                conversation._id
              ),
              by: String(req.client._id),
              byType: "client",
            }
          );
        }
      } catch (notifErr) {
        console.error(
          "client seen notif err:",
          notifErr
        );
      }

      /* ===================================================== */

      return res.json({
        success: true,
        message:
          "Conversation marked as read",
      });
    } catch (error) {
      console.error(
        "markClientConversationAsRead error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to mark conversation as read",
        error: error.message,
      });
    }
  };

/* =========================================================
   EDIT CLIENT MESSAGE

   PATCH /api/client-messages/:id
========================================================= */

export const editClientMessage =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        text,
      } = req.body;

      /* =====================================================
         VALIDATE TEXT
      ===================================================== */

      if (
        !text ||
        !text.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Message text is required",
        });
      }

      /* =====================================================
         GET MESSAGE
      ===================================================== */

      const message =
        await Message.findById(
          id
        );

      if (!message) {
        return res.status(404).json({
          success: false,
          message:
            "Message not found",
        });
      }

      /* =====================================================
         CLIENT OWNERSHIP
      ===================================================== */

      if (
        !isSameId(
          message.senderClient,
          req.client._id
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only edit your own messages",
        });
      }

      /* =====================================================
         CHECK CONVERSATION ACCESS
      ===================================================== */

      const conversation =
        await Conversation.findById(
          message.conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to edit this message",
        });
      }

      /* =====================================================
         DELETED MESSAGE CHECK
      ===================================================== */

      if (message.isDeleted) {
        return res.status(400).json({
          success: false,
          message:
            "Deleted message cannot be edited",
        });
      }

      /* =====================================================
         UPDATE MESSAGE
      ===================================================== */

      message.text =
        text.trim();

      message.isEdited =
        true;

      message.editedAt =
        new Date();

      await message.save();

      /* =====================================================
         POPULATE UPDATED MESSAGE
      ===================================================== */

      const updatedMessage =
        await Message.findById(
          message._id
        )
          .populate(
            "sender",
            "name email phone role profileImage designation department"
          )
          .populate(
            "senderClient",
            "clientName companyName email phone"
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
        data:
          updatedMessage,
      });
    } catch (error) {
      console.error(
        "editClientMessage error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to edit client message",
        error: error.message,
      });
    }
  };

/* =========================================================
   DELETE CLIENT MESSAGE

   DELETE /api/client-messages/:id
========================================================= */

export const deleteClientMessage =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      /* =====================================================
         GET MESSAGE
      ===================================================== */

      const message =
        await Message.findById(
          id
        );

      if (!message) {
        return res.status(404).json({
          success: false,
          message:
            "Message not found",
        });
      }

      /* =====================================================
         CLIENT OWNERSHIP
      ===================================================== */

      if (
        !isSameId(
          message.senderClient,
          req.client._id
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only delete your own messages",
        });
      }

      /* =====================================================
         CHECK CONVERSATION ACCESS
      ===================================================== */

      const conversation =
        await Conversation.findById(
          message.conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to delete this message",
        });
      }

      /* =====================================================
         SOFT DELETE
      ===================================================== */

      message.isDeleted =
        true;

      message.deletedAt =
        new Date();

      message.text =
        "";

      await message.save();

      return res.json({
        success: true,
        message:
          "Message deleted successfully",
      });
    } catch (error) {
      console.error(
        "deleteClientMessage error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete client message",
        error: error.message,
      });
    }
  };

/* =========================================================
   UPLOAD CLIENT MESSAGE ATTACHMENT

   POST /api/client-messages/upload
========================================================= */

export const uploadClientMessageAttachment =
  async (req, res) => {
    try {
      const {
        conversationId,
      } = req.body;

      /* =====================================================
         VALIDATE CONVERSATION ID
      ===================================================== */

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message:
            "conversationId is required",
        });
      }

      /* =====================================================
         VALIDATE FILE
      ===================================================== */

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Please select a file",
        });
      }

      /* =====================================================
         GET CONVERSATION
      ===================================================== */

      const conversation =
        await Conversation.findById(
          conversationId
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message:
            "Conversation not found",
        });
      }

      /* =====================================================
         ACCESS CHECK
      ===================================================== */

      const allowed =
        await canClientAccessConversation(
          conversation,
          req.client._id
        );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to upload files in this conversation",
        });
      }

      /* =====================================================
         CONVERT FILE FOR IMAGEKIT
      ===================================================== */

      const imageKitFile =
        await toFile(
          req.file.buffer,
          req.file.originalname
        );

      /* =====================================================
         UPLOAD TO IMAGEKIT
      ===================================================== */

      const uploadResponse =
        await imagekit.files.upload({
          file:
            imageKitFile,

          fileName:
            req.file.originalname,

          folder:
            "/zwolf/messages",

          useUniqueFileName:
            true,
        });

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
            uploadResponse.fileId ||
            "",

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
        "UPLOAD CLIENT MESSAGE ATTACHMENT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to upload attachment",

        error:
          process.env.NODE_ENV ===
          "production"
            ? undefined
            : error.message,
      });
    }
  };