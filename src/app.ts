import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { toAskGemini } from "./ai/gemini"; // Importación correcta

const mainFlow = addKeyword<Provider, Database>([EVENTS.MESSAGE])
    .addAction(async (ctx, { provider }) => {
        try {
            const phone = ctx.from;
            const message = ctx.body;
            
            // Llamada correcta a Gemini
            const response = await toAskGemini(message, []);
            
            await provider.sendText(`${phone}@s.whatsapp.net`, response);
            
        } catch (error) {
            console.error('Error:', error);
        }
    });

const main = async () => {
    const adapterFlow = createFlow([mainFlow]);
    const adapterProvider = createProvider(Provider);
    const adapterDB = new Database();

    const { httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    httpServer(Number(process.env.PORT) || 3008);
};

main();