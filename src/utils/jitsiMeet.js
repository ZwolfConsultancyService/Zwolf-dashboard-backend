import crypto from "crypto";

/* =========================================================
   GENERATE JITSI MEET LINK
   
   Free, no API key needed.
   Link format: https://meet.jit.si/zwolf-<random>
========================================================= */

export const generateJitsiLink = () => {
  const randomId = crypto
    .randomBytes(6)
    .toString("hex");

  return `https://meet.jit.si/zwolf-${randomId}`;
};