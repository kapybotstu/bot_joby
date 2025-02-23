import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { MemoryDB as Database } from '@builderbot/bot';

const mainFlow = addKeyword<typeof BaileysProvider, Database>(['hola', 'hi', 'hello'])
    .addAnswer('🙌 ¡Bienvenido al chatbot!')
    .addAnswer('¿En qué puedo ayudarte?');

const main = async () => {
    const adapterFlow = createFlow([mainFlow]);
    const adapterProvider = createProvider(BaileysProvider, { 
        usePairingCode: true,
        phoneNumber: process.env.PHONE_NUMBER, // Ejemplo: 521234567890
        authDir: './sessions', // Directorio para persistencia de sesión
        browserName: 'MyBusinessBot' // Nombre personalizado
    });
    const adapterDB = new Database();

    await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    console.log('Bot iniciado. Esperando código de emparejamiento...');
};

main();