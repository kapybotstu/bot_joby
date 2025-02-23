import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { toAskGemini } from "./ai/gemini";

// Configuración del proveedor con persistencia
const adapterProvider = createProvider(BaileysProvider, {
  authDir: './bot_sessions',
  browserName: 'MyBot',
  browserVersion: '4.0.0',
  phoneNumber: process.env.PHONE_NUMBER // Añadir número de teléfono desde .env
});

const mainFlow = addKeyword<typeof adapterProvider, Database>([''])
.addAction(async (ctx, { provider }) => {
  const rawPhone = ctx.from.includes('@s.whatsapp.net') 
    ? ctx.from 
    : `${ctx.from}@s.whatsapp.net`;
  
  try {
    const message = ctx.body;
    const prompt = `Mensaje del usuario: "${message}"\n\n`;
    
    const geminiResponse = await toAskGemini(prompt, []);
    let finalResponse = geminiResponse;

    // Lógica adicional si es necesaria
    
    await provider.sendText(rawPhone, finalResponse);
    
  } catch (error) {
    console.error('Error en el flujo:', error);
    await provider.sendText(rawPhone, '⚠️ Error procesando tu mensaje. Intenta nuevamente.');
  }
});

const main = async () => {
  const adapterFlow = createFlow([mainFlow]);
  const adapterDB = new Database();

  const { httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  httpServer(Number(process.env.PORT) || 3008);
};

// Configuración de variables de entorno necesarias
/*
PORT=3008
PHONE_NUMBER=1234567890
*/

main();