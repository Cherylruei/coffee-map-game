// generate-test-qr.js - 生成測試用 QR Code
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function generateQRCodes() {
    try {
        console.log('🔑 使用 Admin Token:', ADMIN_TOKEN);
        console.log('📡 正在生成 QR Code...\n');

        const response = await axios.post(
            `${API_URL}/api/admin/qrcode/generate`,
            {
                quantity: 5,
                expiresInDays: 30
            },
            {
                headers: {
                    'x-admin-token': ADMIN_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.success) {
            console.log('✅ 成功生成 QR Codes:\n');
            response.data.qrCodes.forEach((qr, index) => {
                console.log(`${index + 1}. Code: ${qr.code}`);
                console.log(`   URL: ${qr.url}\n`);
            });

            // 保存第一個 QR Code 供測試使用
            const firstQR = response.data.qrCodes[0];
            console.log('📋 測試用 QR Code (複製此代碼):');
            console.log(`   ${firstQR.code}\n`);

            return response.data.qrCodes;
        } else {
            console.error('❌ 生成失敗:', response.data.message);
        }
    } catch (error) {
        console.error('❌ 錯誤:', error.response?.data || error.message);
    }
}

generateQRCodes();
