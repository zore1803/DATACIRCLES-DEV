// services/walletApi.js
//
// Prepaid credit wallet — deliberately separate from subscriptionApi.js. The
// wallet is independent of subscription state and must stay that way.
import API from './api';

export const walletAPI = {
  getWallet: () => API.get('/wallet'),
  getTransactions: (params) => API.get('/wallet/transactions', { params }),

  // `credits` is a credit quantity, not rupees. The backend prices it.
  createOrder: (credits) => API.post('/wallet/order', { credits }),

  verifyPayment: (data) => API.post('/wallet/verify', data),

  // threshold: number|null (null clears the reminder). email: string.
  setReminder: (threshold, email) => API.post('/wallet/reminder', { threshold, email }),
};

export default walletAPI;
