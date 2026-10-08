import axios from 'axios';
import FormData from 'form-data';

/* =========================================================
   ML SERVER CONFIG
========================================================= */

const ML_SERVER_URL =
  process.env.ML_SERVER_URL || 'http://localhost:5001';

/* =========================================================
   REGISTER FACE
   
   @param {String} employeeId  - MongoDB user _id
   @param {Buffer} imageBuffer - Image file buffer
   @param {String} filename    - Original filename
   @returns {Object} { success, data | error }
========================================================= */

export const registerFaceWithML = async (
  employeeId,
  imageBuffer,
  filename = 'face.jpg'
) => {
  try {
    const form = new FormData();
    form.append('employeeId', String(employeeId));
    form.append('images', imageBuffer, {
      filename,
      contentType: 'image/jpeg',
    });

    const response = await axios.post(
      `${ML_SERVER_URL}/register`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
      }
    );

    return {
      success: true,
      data: response.data?.data,
    };
  } catch (err) {
    console.error(
      'registerFaceWithML error:',
      err.response?.data || err.message
    );

    return {
      success: false,
      error:
        err.response?.data?.error ||
        err.message ||
        'ML server error',
    };
  }
};

/* =========================================================
   RECOGNIZE FACE
   
   @param {Buffer} imageBuffer - Image file buffer
   @param {String} filename    - Original filename
   @returns {Object} { success, data | error }
========================================================= */

export const recognizeFaceWithML = async (
  imageBuffer,
  filename = 'face.jpg'
) => {
  try {
    const form = new FormData();
    form.append('image', imageBuffer, {
      filename,
      contentType: 'image/jpeg',
    });

    const response = await axios.post(
      `${ML_SERVER_URL}/recognize`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
      }
    );

    return {
      success: true,
      data: response.data?.data,
    };
  } catch (err) {
    console.error(
      'recognizeFaceWithML error:',
      err.response?.data || err.message
    );

    return {
      success: false,
      error:
        err.response?.data?.error ||
        err.message ||
        'ML server error',
    };
  }
};

/* =========================================================
   DELETE FACE
========================================================= */

export const deleteFaceWithML = async (employeeId) => {
  try {
    const response = await axios.delete(
      `${ML_SERVER_URL}/employees/${employeeId}`,
      { timeout: 10000 }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    console.error(
      'deleteFaceWithML error:',
      err.response?.data || err.message
    );

    return {
      success: false,
      error: err.response?.data?.error || err.message,
    };
  }
};

/* =========================================================
   CHECK ML SERVER HEALTH
========================================================= */

export const checkMLHealth = async () => {
  try {
    const response = await axios.get(`${ML_SERVER_URL}/health`, {
      timeout: 5000,
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
};

/* =========================================================
   LIST REGISTERED EMPLOYEES
========================================================= */

export const listRegisteredFaces = async () => {
  try {
    const response = await axios.get(
      `${ML_SERVER_URL}/employees`,
      { timeout: 10000 }
    );

    return {
      success: true,
      data: response.data?.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
};