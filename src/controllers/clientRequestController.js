import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Client from "../models/Client.js";
import User from "../models/User.js";
import { emitToUser, isUserOnline } from "../../socket.js";
import { sendPushToEmployee } from "../utils/pushNotification.js";
import { generateJitsiLink } from "../utils/jitsiMeet.js";

/* =========================================================
   SEND CLIENT REQUEST (Project / SEO / Meeting)
   
   POST /api/client-requests/send
========================================================= */

export const sendClientRequest = async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      budget,
      websiteUrl,
      meetingType,
      meetingDate,
      meetingTime,
      meetingDuration,
      meetingAddress,
    } = req.body;

    /* =====================================================
       VALIDATE TYPE
    ===================================================== */

    if (!["project", "seo", "meeting"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type must be "project", "seo" or "meeting"',
      });
    }

    /* =====================================================
       VALIDATE COMMON FIELDS
    ===================================================== */

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description is required",
      });
    }

    /* =====================================================
       VALIDATE SEO
    ===================================================== */

    if (type === "seo" && (!websiteUrl || !websiteUrl.trim())) {
      return res.status(400).json({
        success: false,
        message: "Website URL is required for SEO request",
      });
    }

    /* =====================================================
       VALIDATE MEETING
    ===================================================== */

    if (type === "meeting") {
      if (
        !meetingType ||
        !["online", "offline"].includes(meetingType)
      ) {
        return res.status(400).json({
          success: false,
          message: 'meetingType must be "online" or "offline"',
        });
      }

      if (!meetingDate) {
        return res.status(400).json({
          success: false,
          message: "Meeting date is required",
        });
      }

      if (!meetingTime) {
        return res.status(400).json({
          success: false,
          message: "Meeting time is required",
        });
      }

      if (
        meetingType === "offline" &&
        (!meetingAddress || !meetingAddress.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "Address is required for offline meetings",
        });
      }
    }

    /* =====================================================
       GET CLIENT
    ===================================================== */

    const client = await Client.findById(req.client._id).select(
      "clientName companyName email phone assignedSales"
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    if (!client.assignedSales) {
      return res.status(400).json({
        success: false,
        message: "No Sales person is assigned to you.",
      });
    }

    /* =====================================================
       GET SALES + MANAGER
    ===================================================== */

    const sales = await User.findById(client.assignedSales)
      .select("name email role reportingManager isActive")
      .populate("reportingManager", "name email role isActive");

    if (!sales) {
      return res.status(404).json({
        success: false,
        message: "Assigned Sales person not found",
      });
    }

    const managerId =
      sales.reportingManager?._id || sales.reportingManager;

    /* =====================================================
       BUILD MESSAGE TEXT
    ===================================================== */

    let messageText = "";

    if (type === "project") {
      messageText = `📁 NEW PROJECT REQUEST\n\n`;
      messageText += `Title: ${title.trim()}\n`;
      messageText += `Description: ${description.trim()}\n`;
      if (budget && String(budget).trim()) {
        messageText += `Budget: ${String(budget).trim()}\n`;
      }
      messageText += `\n— Sent from Client Portal`;
    } else if (type === "seo") {
      messageText = `🔍 SEO PLAN REQUEST\n\n`;
      messageText += `Website: ${websiteUrl.trim()}\n`;
      messageText += `Title: ${title.trim()}\n`;
      messageText += `Description: ${description.trim()}\n`;
      if (budget && String(budget).trim()) {
        messageText += `Budget: ${String(budget).trim()}\n`;
      }
      messageText += `\n— Sent from Client Portal`;
    } else if (type === "meeting") {
      let meetingLink = "";

      if (meetingType === "online") {
        meetingLink = generateJitsiLink();
      }

      const formattedDate = new Date(
        `${meetingDate}T${meetingTime}`
      ).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      messageText = `📅 NEW MEETING REQUEST\n\n`;
      messageText += `Title: ${title.trim()}\n`;
      messageText += `Type: ${
        meetingType === "online" ? "Online (Jitsi Meet)" : "Offline"
      }\n`;
      messageText += `Date & Time: ${formattedDate}\n`;
      messageText += `Duration: ${meetingDuration || "30"} min\n`;

      if (meetingType === "online") {
        messageText += `Meeting Link: ${meetingLink}\n`;
      } else {
        messageText += `Address: ${meetingAddress.trim()}\n`;
      }

      messageText += `\nDescription: ${description.trim()}\n`;

      if (budget && String(budget).trim()) {
        messageText += `Budget: ${String(budget).trim()}\n`;
      }

      messageText += `\n— Sent from Client Portal`;
    }

    const senderName =
      client.clientName || client.companyName || "Client";

    const notifTitle =
      type === "project"
        ? `📁 New Project Request`
        : type === "seo"
        ? `🔍 New SEO Request`
        : `📅 New Meeting Request`;

    const notifBody = `${title.trim()} — from ${senderName}`;

    /* =====================================================
       ⚡ HELPER — SEND MESSAGE + NOTIFICATION
    ===================================================== */

    const sendRequestToConversation = async (
      conversation,
      receiverUserId
    ) => {
      const msg = await Message.create({
        conversationId: conversation._id,
        sender: null,
        senderClient: client._id,
        senderType: "client",
        receiver: receiverUserId,
        client: client._id,
        text: messageText,
        attachments: [],
        messageType: "text",
        replyTo: null,
      });

      conversation.lastMessage = msg._id;
      conversation.lastMessageAt = new Date();
      conversation.unreadCount =
        Number(conversation.unreadCount || 0) + 1;

      await conversation.save();

      const populated = await Message.findById(msg._id)
        .populate(
          "sender",
          "name email phone role profileImage designation department"
        )
        .populate("senderClient", "clientName companyName email phone")
        .populate(
          "receiver",
          "name email phone role profileImage designation department"
        )
        .populate("client", "clientName companyName email phone");

      /* 🔔 SOCKET + PUSH */
      try {
        const receiverIdStr = String(receiverUserId);
        const online = isUserOnline(receiverIdStr);

        emitToUser(receiverIdStr, "new-message", {
          conversationId: String(conversation._id),
          message: populated,
          senderName,
        });

        if (!online) {
          sendPushToEmployee(receiverIdStr, {
            title: notifTitle,
            body: notifBody,
            conversationId: String(conversation._id),
            url: `/messages?c=${conversation._id}`,
            tag: `msg-${conversation._id}`,
          }).catch((e) =>
            console.error("request push err:", e)
          );
        }
      } catch (notifErr) {
        console.error("request notif err:", notifErr);
      }

      return populated;
    };

    /* =====================================================
       1. CLIENT ↔ SALES CONVERSATION
    ===================================================== */

    let salesConversation = await Conversation.findOne({
      type: "client",
      client: client._id,
      sales: sales._id,
      isActive: true,
    });

    if (!salesConversation) {
      salesConversation = await Conversation.create({
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

    const salesMessage = await sendRequestToConversation(
      salesConversation,
      sales._id
    );

    /* =====================================================
       2. CLIENT ↔ MANAGER CONVERSATION
    ===================================================== */

    let managerMessage = null;

    if (managerId) {
      let managerConversation = await Conversation.findOne({
        type: "client",
        client: client._id,
        manager: managerId,
        isActive: true,
      });

      if (!managerConversation) {
        managerConversation = await Conversation.create({
          type: "client",
          client: client._id,
          manager: managerId,
          sales: null,
          employee: null,
          lastMessage: null,
          lastMessageAt: null,
          unreadCount: 0,
          isActive: true,
        });
      }

      managerMessage = await sendRequestToConversation(
        managerConversation,
        managerId
      );
    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(201).json({
      success: true,
      message:
        type === "project"
          ? "Project request sent successfully"
          : type === "seo"
          ? "SEO request sent successfully"
          : "Meeting request sent successfully",
      data: salesMessage,
      managerMessage: managerMessage || null,
    });
  } catch (error) {
    console.error("sendClientRequest error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send request",
      error: error.message,
    });
  }
};

/* =========================================================
   GET ALL CLIENT REQUESTS (Manager View)
   
   GET /api/client-requests?page=1&limit=20&type=project|seo|meeting
========================================================= */

export const getClientRequests = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );
    const skip = (page - 1) * limit;

    const { type } = req.query;

    /* =====================================================
       FIND ONLY MANAGER'S OWN CLIENT CONVERSATIONS
    ===================================================== */

  /* =====================================================
   ROLE-BASED CONVERSATION FILTER

   Manager → apni client conversations
   Sales   → apne assigned clients ki conversations
===================================================== */

let conversationFilter = {
  type: 'client',
  isActive: true,
};

if (req.user.role === 'manager') {
  conversationFilter.manager = req.user._id;
} else if (req.user.role === 'sales') {
  conversationFilter.sales = req.user._id;
} else {
  return res.status(403).json({
    success: false,
    message: 'You are not allowed to view client requests',
  });
}

    const conversations = await Conversation.find(
      conversationFilter
    ).select("_id");

    const conversationIds = conversations.map((c) => c._id);

    if (conversationIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0,
        },
      });
    }

    /* =====================================================
       FIND REQUEST MESSAGES
    ===================================================== */

    let textFilter = {
      $or: [
        { text: { $regex: /^📁 NEW PROJECT REQUEST/m } },
        { text: { $regex: /^🔍 SEO PLAN REQUEST/m } },
        { text: { $regex: /^📅 NEW MEETING REQUEST/m } },
      ],
    };

    if (type === "project") {
      textFilter = {
        text: { $regex: /^📁 NEW PROJECT REQUEST/m },
      };
    } else if (type === "seo") {
      textFilter = {
        text: { $regex: /^🔍 SEO PLAN REQUEST/m },
      };
    } else if (type === "meeting") {
      textFilter = {
        text: { $regex: /^📅 NEW MEETING REQUEST/m },
      };
    }

    const messageFilter = {
      conversationId: { $in: conversationIds },
      senderType: "client",
      isDeleted: { $ne: true },
      ...textFilter,
    };

    /* =====================================================
       COUNT + FETCH
    ===================================================== */

    const total = await Message.countDocuments(messageFilter);

    const requests = await Message.find(messageFilter)
      .populate(
        "senderClient",
        "clientName companyName email phone"
      )
      .populate(
        "conversationId",
        "type client sales manager"
      )
      .populate("receiver", "name email phone role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    /* =====================================================
       PARSE REQUEST DETAILS FROM TEXT
    ===================================================== */

    const parsed = requests.map((msg) => {
      const text = msg.text || "";

      const isProject = text.includes("NEW PROJECT REQUEST");
      const isSeo = text.includes("SEO PLAN REQUEST");
      const isMeeting = text.includes("NEW MEETING REQUEST");

      const extract = (key) => {
        const regex = new RegExp(`${key}:\\s*(.+)`, "i");
        const match = text.match(regex);
        return match ? match[1].trim() : "";
      };

      let title = "";
      let description = "";
      let budget = "";
      let websiteUrl = "";
      let meetingType = "";
      let meetingDateTime = "";
      let meetingDuration = "";
      let meetingAddress = "";
      let meetingLink = "";

      if (isProject) {
        title = extract("Title");
        description = extract("Description");
        budget = extract("Budget");
      }

      if (isSeo) {
        websiteUrl = extract("Website");
        title = extract("Title");
        description = extract("Description");
        budget = extract("Budget");
      }

      if (isMeeting) {
        title = extract("Title");
        description = extract("Description");
        budget = extract("Budget");
        meetingDateTime = extract("Date & Time");
        meetingDuration = extract("Duration");
        meetingAddress = extract("Address");
        meetingLink = extract("Meeting Link");

        const typeMatch = text.match(/Type:\s*(.+)/i);
        if (typeMatch) {
          meetingType = typeMatch[1]
            .toLowerCase()
            .includes("online")
            ? "online"
            : "offline";
        }
      }

      return {
        _id: msg._id,
        type: isProject
          ? "project"
          : isSeo
          ? "seo"
          : isMeeting
          ? "meeting"
          : "unknown",
        title,
        description,
        budget,
        websiteUrl,
        meetingType,
        meetingDateTime,
        meetingDuration,
        meetingAddress,
        meetingLink,
        createdAt: msg.createdAt,
        readAt: msg.readAt,
        client: msg.senderClient,
        conversationId: msg.conversationId?._id,
        receiver: msg.receiver,
        rawText: text,
      };
    });

    return res.json({
      success: true,
      data: parsed,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("getClientRequests error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch client requests",
      error: error.message,
    });
  }
};

/* =========================================================
   GET MY MEETINGS (Client View)
   
   GET /api/client-requests/my-meetings
   
   Client apni saari meetings dekhe (jo usne bheji hain).
========================================================= */

export const getMyMeetings = async (req, res) => {
  try {
    const clientId = req.client._id;

    /* =====================================================
       FIND ALL CLIENT CONVERSATIONS (jaha client participant hai)
    ===================================================== */

    const conversations = await Conversation.find({
      type: "client",
      client: clientId,
      isActive: true,
    }).select("_id");

    const conversationIds = conversations.map((c) => c._id);

    if (conversationIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    /* =====================================================
       FIND MEETING REQUEST MESSAGES
    ===================================================== */

    const messages = await Message.find({
      conversationId: { $in: conversationIds },
      senderType: "client",
      senderClient: clientId,
      isDeleted: { $ne: true },
      text: { $regex: /^📅 NEW MEETING REQUEST/m },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    /* =====================================================
       PARSE MEETING DETAILS
    ===================================================== */

    const extract = (text, key) => {
      const regex = new RegExp(`${key}:\\s*(.+)`, "i");
      const match = text.match(regex);
      return match ? match[1].trim() : "";
    };

    const meetings = messages.map((msg) => {
      const text = msg.text || "";

      const title = extract(text, "Title");
      const description = extract(text, "Description");
      const budget = extract(text, "Budget");
      const dateTime = extract(text, "Date & Time");
      const duration = extract(text, "Duration");
      const address = extract(text, "Address");
      const link = extract(text, "Meeting Link");

      const typeMatch = text.match(/Type:\s*(.+)/i);
      const meetingType = typeMatch
        ? typeMatch[1].toLowerCase().includes("online")
          ? "online"
          : "offline"
        : "offline";

      return {
        _id: msg._id,
        title,
        description,
        budget,
        meetingType,
        meetingDateTime: dateTime,
        meetingDuration: duration,
        meetingAddress: address,
        meetingLink: link,
        createdAt: msg.createdAt,
        conversationId: msg.conversationId,
      };
    });

    return res.json({
      success: true,
      data: meetings,
    });
  } catch (error) {
    console.error("getMyMeetings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your meetings",
      error: error.message,
    });
  }
};