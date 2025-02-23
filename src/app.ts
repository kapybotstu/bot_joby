import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { toAskGemini } from "./ai/gemini";
import { BaileysProvider } from '@builderbot/provider-baileys'

const mainFlow = addKeyword<Provider, Database>([''])
.addAction(async (ctx, { provider }) => {
  const rawPhone = ctx.from.includes('@s.whatsapp.net') ? ctx.from : `${ctx.from}@s.whatsapp.net`;
  
  try {
    const message = ctx.body;
    const prompt = `Mensaje del usuario: "${message}"\n\n`;
    
    const geminiResponse = await toAskGemini(prompt, []);
    let finalResponse = geminiResponse;

    await provider.sendText(rawPhone, finalResponse);
    
  } catch (error) {
    console.error('Error en el flujo:', error);
    await provider.sendText(rawPhone, '⚠️ Error procesando tu mensaje. Intenta nuevamente.');
  }
});

const main = async () => {
  const adapterFlow = createFlow([mainFlow]);
  const adapterProvider = createProvider(BaileysProvider, {
    authDir: './sessions',  // Directorio que usará el volumen de Railway
  });
  const adapterDB = new Database();

  const { httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  httpServer(Number(process.env.PORT) || 3008);
};

main();