import mongoose from 'mongoose';

const whatsappSettingSchema = new mongoose.Schema(
  {
    phoneNumberId: { type: String, default: '' },
    wabaId: { type: String, default: '' },
    senderNumber: { type: String, default: '9010253076' },
    accessToken: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('WhatsAppSetting', whatsappSettingSchema);
