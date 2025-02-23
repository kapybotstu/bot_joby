import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { MemoryDB as Database } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { toAskGemini } from "./ai/gemini";
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';




// Configuración de CSV
const SURVEY_LINK = 'https://form.typeform.com/to/S7a11JVF';
const usersCsvPath = path.join(process.cwd(), 'src/data_test/BBDD_USUARIOS - USERS.csv');
const usersCsv = fs.readFileSync(usersCsvPath, 'utf-8');

interface User {
  id_usuario: string;
  Nombre: string;
  'H/M': string;
  Teléfono: string;
  Empresa: string;
  'Estado usuario': string;
  'Gen (X, Y, Z)': string;
  Departamento: string;
  [key: string]: string;
}

// Cargar datos de usuarios
const users: User[] = parse(usersCsv, {
  columns: true,
  skip_empty_lines: true,
  delimiter: ',',
  relax_quotes: true,
  trim: true
});

const cleanPhoneNumber = (phone: string): string => {
  return phone.replace(/[^0-9]/g, '')
    .replace(/^whatsapp:/, '')
    .replace(/^521/, '52')
    .replace(/^549/, '54')
    .replace(/(56)?9(\d{8})$/, '569$2'); // Formato chileno estándar
};

const getUserData = (phone: string): User | null => {
  const cleanedPhone = cleanPhoneNumber(phone);
  
  return users.find(user => {
    const userPhone = user.Teléfono ? cleanPhoneNumber(user.Teléfono) : '';
    return userPhone === cleanedPhone;
  }) || null;
};

const mainFlow = addKeyword<Provider, Database>([EVENTS.MESSAGE])
.addAction(async (ctx, { provider }) => {
  const rawPhone = ctx.from.includes('@s.whatsapp.net') ? ctx.from : `${ctx.from}@s.whatsapp.net`;
  
  try {
    const user = getUserData(rawPhone);
    const message = ctx.body;
    
    let prompt = `Mensaje del usuario: "${message}"\n\n`;
    
    if (user) {
      prompt += `Contexto del usuario:
- Nombre: ${user.Nombre}
- Empresa: ${user.Empresa}
- Género: ${user['H/M']}
- Generación: ${user['Gen (X, Y, Z)']}
- Departamento: ${user.Departamento}
- Estado: ${user['Estado usuario']}
- Teléfono: ${user.Teléfono}\n`;
    }

    const geminiResponse = await toAskGemini(prompt, []);
    let finalResponse = geminiResponse;
    
    // Lógica de recordatorio adaptada
    if (user && user['Estado usuario'] === 'ACTIVO') {
      finalResponse += `\n\n📌 ¿Necesitas ayuda adicional o quieres consultar otros beneficios?`;
    }

    // Manejo de usuarios desvinculados
    if (user && user['Estado usuario'] === 'TERMINADO') {
      finalResponse = `⚠️ Tu cuenta aparece como desvinculada. Para más información contacta a RRHH.`;
    }

    await provider.sendText(rawPhone, finalResponse);
    
  } catch (error) {
    console.error('Error en el flujo:', error);
    await provider.sendText(rawPhone, '⚠️ Error procesando tu mensaje. Intenta nuevamente.');
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