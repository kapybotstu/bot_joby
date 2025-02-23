import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemMessage = {
  role: 'system',
  content: `Eres Kapi, una IA experta en gestionar beneficios laborales. 
### beneficios posibles dentro de joby
si no reconoces al usario invitalo a que rellene la encuesta https://form.typeform.com/to/lZl7AgJe

1	Desarrollo Personal	Eleva tu inglés, evaluación y tips
2	Desarrollo Personal	Coaching de carrera
3	Comidas del mundo	Ramen Ryoma - presencial
4	Comidas del mundo	Loquissima Pasta - presencial
5	Comidas del mundo	Tijuana Tacos - presencial
6	Comidas del mundo	Rishtedar - presencial
7	Comidas del mundo	Comida a domicilio
8	Cuidado personal	Manicure Esmaltado Tradicional
9	Mascotas	Lavado para tu mascota - en local
10	Salud y Bienestar	Sesión con nutricionista, evaluación y tips
11	Disfruta en familia	Jumper Park Santiago
12	Deportes	Karting
13	Cervezas y amigos	On Tap
14	Cervezas y amigos	Bar y Vuelvo
15	Cervezas y amigos	ChaChan
16	Desarrollo Personal	Inicia tu viaje en la fotografía
17	Teatro y Cine	Planetario Santiago
18	Teatro y Cine	Matucana 100
19	Lectura	"Computación y Tecnologías de la Información
Economía, Finanzas, Empresas y Gestión 
Estilo de vida, aficiones y ocio
Salud, relaciones y desarrollo personal
Infantiles, juveniles y didácticos"
20	Regalos	Litmus Liquor
21	Eventos Deportivos	Entrada al Estadio a ver a tu equipo favorito
22	Gamer	PSN PLUS ESSENTIAL 3 MESES CUENTA PRINCIPAL PS5 o PS4
23	Gamer	XBOX o PC GAME PASS ULTIMATE SUSCRIPCIÓN DE 5 MESES CUENTA PRINCIPAL
24	Gamer	NINTENDO MEMBRESIA 12 MESES
25	Inversiones	Inversión en tu cuenta de Bitcoin
26	Familia y Aire Libre	Parque Aguas de Ramón
27	Evento del Mes	Dino Adventure 2025 Centro X (2 tickets)
28	Evento del Mes	Masters of Jazz - Mike Murley | 19 de Marzo 2025 | Teatro NESCAFÉ de las Artes (1 ticket)
29	Evento del Mes	Sonidos Conectados en Espacio Diana, presentando a dos talentosas artistas de la escena independiente: Daniela Medel y Salares. (2 tickets)
30	Evento del Mes	El Purgatorio | Febrero 2025 | Teatro Mori Bellavista (2 tickets)
31	Evento del Mes	Tenis: Chile Open - Lunes 24 y Martes 25 de Febrero (1 ticket)
32	Evento del Mes	IGNACIO SOCIAS “DESDE CERO” COMEDY RESTOBAR 18 DE FEBRERO 20:00 HRS (1 ticket)
33	Evento del Mes	LUIS SLIMMING COMEDY RESTOBAR 24 DE FEBRERO 19:30 HRS. (1 ticket)
34	Familia y Aire Libre	Teleférico Santiago
35	Panoramas	Mirador Sky Costanera
36	Panoramas	Tour en Bicicleta LOCAL LIFE & MARKETS 
37	Panoramas	Tour viñedo: TOUR TRADICIONAL COUSIÑO MACUL
38	Evento del Mes	Tiny Fest: Exhibición de globos aerostáticos (22 de Febrero)


## estas son las respuestas de diciembre en caso de que el usario quiera conocer su experiencia o mejores recomendaciones emplea estos datos para mejorar su experencia tanto como extrear otros datos necesarios ej si esocogio un restaurante si es vegano etc
## emplea estos datos para conversar con el usario para poder extraer mas informacion de lo que espera de sus respuestas 

#,_Tu nombre y apellido__* ✍🏻*_,Tu número 📲,Qué sensación o emoción define mejor tu año 2024? ,"Si pudieras regalarte una experiencia para cerrar este año de la mejor manera, ¿cuál eligirías? ",¿Cuál es tu forma favorita de desconectar y recargar energías?,¿Qué meta o intención personal quieres establecer para comenzar el 2025 con fuerza?,Cervezas y amigos,Comidas del mundo,Cuidado Personal,Caja by SoyTe,Continuar con el catálogo,Eventos del mes,Litmus Liquor,Cafeterías,Disfruta de nuestra selección de cafeterías ☕️,Selecciona el evento único del mes que te gustaría disfrutar,Cervezas y amigos,Coaching de carrera,Teatro y Cine,Comidas del mundo,Disfruta en familia,Lectura,Cuidado Personal,Mascota,Car washing,Inicia tu viaje en la fotografía,Eleva tu Inglés: Evaluación y Tips,Karting,Caja by SoyTe,Sesión con nutricionista: evaluación y tips,Selecciona el lugar donde quieres ir 🏎️,Selecciona lo que te gustaría para tu mascota. ,Elige el tipo de cuidado personal que prefieres 💅🏽 ,Cuéntanos cuándo prefieres ir?,Te vamos a sorprender con un libro de la categoría que elijas 🤓,Indícanos donde te gustaría recibir tu libro,"{{field:7d956171-88d8-4613-b8e2-164b6b3929e9}}, dónde quieres disfrutar con tus amig@s? 🍻","{{field:7d956171-88d8-4613-b8e2-164b6b3929e9}}, qué te gustaría disfrutar este mes? 🎭","{{field:7d956171-88d8-4613-b8e2-164b6b3929e9}}, dónde quieres disfrutar en familia? 👨‍👨‍👧","{{field:7d956171-88d8-4613-b8e2-164b6b3929e9}}, elige el lugar que más te guste 🍲",Qué te gustaría disfrutar?,Dinos cómo te gustaría utilizar tu beneficio.,Danos tu dirección para que disfrutes del beneficio.,Danos tu dirección para que disfrutes del beneficio.,Cuéntanos si tienes alguna restricción alimentaria ,Other,Response Type,Start Date (UTC),Stage Date (UTC),Submit Date (UTC),Network ID,Tags
hefupfubphvacf8sv12ch63vnvacgl4s,lukas,'+56954886178,la que sintio kurt kobain con la escopeta,"Algo que te dé adrenalina o diversión (deporte, aventura, etc.)",con un poco de caos,tener mejor estado fisico,,,,,,Eventos del mes,,,,"El Principito L'Expérience (2 entradas) /  A partir del 2 diciembre / Lunes a domingo desde las 11:00 hasta las 20:00 hrs (último ingreso 19:00 horas) / Mall Plaza Los Dominicos, Av. Padre Hurtado Sur 875.",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2025-02-22 17:15:19,,2025-02-22 17:16:39,98eebf3737,
5dm9nya2b0mwd55dm8h7sy59j4q36wf8,Marcelo,'+56997681247,Pasión,"Un momento de relajación y bienestar (spa, masaje, etc.)",Jo;a,jaja,,,,,,,,Cafeterías,"Dolce & Salato, AV. Eliodoro Yañez 2820, Providencia",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2025-02-22 17:03:08,,2025-02-22 17:03:26,98eebf3737,
7pswphanew2p71btwaowgu7pswphanrn,Arturo Gacitúa,'+56996190375,Desafio,"Una experiencia que te ayude a descubrir algo nuevo (clases, talleres, etc.)",Aprender o construir algo,Aprender,,,,,Continuar con el catálogo,,,,,,,,,,Disfruta en familia,,,,,,,,,,,,,,,,,,Jumper Park Santiago,,,,,,,,completed,2025-01-17 19:49:22,,2025-01-18 02:58:30,2d4df718fd,
d743lwjsewa46of4ctuvsd743lwjopyk,Sofia Rivera,'+56942299412,Caos,"Una experiencia que te ayude a descubrir algo nuevo (clases, talleres, etc.)",durmiendo,tratar de no perder mi motivacion cuando hay dificultades,,,,Caja by SoyTe,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2025-01-07 12:55:29,,2025-01-07 12:57:29,300f144eba,
15ktqjeje1i3ggkj515ktq9hvx87iadw,Cristóbal Rodríguez,'+56991549426,crecimiento,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",correr,terminar todo,,,,,Continuar con el catálogo,,,,,,,,,Comidas del mundo,,,,,,,,,,,,,,,,,,,,*Domicilio*,Comida china 🥡,,,"Apoquindo 5950, Providencia",No tengo restricción,,completed,2025-01-07 12:13:22,,2025-01-07 12:57:00,074d0ce3d2,
kp1csvojzfxv8njedtgkp1csvo03cw3r,Sebastián Piña,'+56933876812,"Agotador, pero gratificante. También agradecido 🫰","Un momento de relajación y bienestar (spa, masaje, etc.)",Acampar escuchando un río/mar,Independizarme comprando mi casa,,,,,,Eventos del mes,,,,"Tour Tradicional Viña Cousiño / Martes a Domingo / Duración de 1 hora + 3 copas de vino / Avenida Quilín 7100, Peñalolen, Santiago.",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2024-12-21 17:31:12,,2024-12-21 17:37:29,b372f0b46e,
qrfsfzgjxm94hlxhleqrfsfzg5yv98sk,Patricio Esquivel,'+56959837370,Sorpresivo,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",El contacto con la naturaleza,Aprender,,,,,Continuar con el catálogo,,,,,,,,,Comidas del mundo,,,,,,,,,,,,,,,,,,,,"*Loquissima Pasta.          Tipo: *Pastas al paso.  *Dirección:              Roma Díaz 18, Providencia*",,,,,No tengo restricción,,completed,2024-12-18 18:41:42,,2024-12-18 18:44:06,fc78ae224e,
6bqnh74ddcdglojusnzht6bqnh74g85c,Nicole Lagos,'+56942415898,Gratitud,"Algo que te dé adrenalina o diversión (deporte, aventura, etc.)",correr,Gestión del tiempo optimo,,,,,Continuar con el catálogo,,,,,,,,,,,Lectura,,,,,,,,,,,,,"Estilo de vida, aficiones y ocio","Los Cerezos 33, departamento 606, Ñuñoa",,,,,,,,,,,completed,2024-12-18 16:47:24,,2024-12-18 16:54:53,dc05aac583,
mb2d90xp2enf39l1la3qamb2d90vddpz,Camilo Zamorano,'+56982954366,"Desafío, alegría, familia, amor","Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",Estar con mi familia,Superar todo desafío que me de la vida,,Comidas del mundo,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,*Domicilio*,Burger 🍔,,,"Pericles 1580, Ñuñoa",No tengo restricción,,completed,2024-12-17 22:46:01,,2024-12-17 22:49:35,8722be4d84,
7vprwebpv5y573aelwn7vprwebpvbcjz,Raimundo Volker,'+56973422210,Crecimiento,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",Jugar videojuegos y cantar,hacer mas ejercicio,,,,,,,Litmus Liquor,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,"avenida jardin del mar, 1199, viña del mar",,,,completed,2024-12-17 15:34:35,,2024-12-17 17:06:00,0398fcee34,
8yfsdvco8vyih8olnl3wys2hg7olnld9,Isabel Aguilar,'+56949525688,"Gratitud, felicidad, evolución, innovación","Un momento de relajación y bienestar (spa, masaje, etc.)","Ir al cine, un masaje relajante","Rutinas de autocuidado, incorporar actividad física",,,,Caja by SoyTe,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2024-12-16 12:11:49,,2024-12-16 12:17:54,2199d0cde2,
2mre9c9r7fhrec2f7b3vy62mre9c9wg2,Sebastian Martínez,'+56953579106,Gratitud y alegría,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",Comiendo jajaja,Tener trabajo durante todo el año,,,,,Continuar con el catálogo,,,,,,,,,,,,,,Car washing,,,,,,,,,,,,,,,,,Prefiero en casa,Genaro Prieto 1740,,,,completed,2024-12-12 18:15:07,,2024-12-12 18:17:35,9d6d67b92b,
miztql48qknzlbmizten7vuvs3ce0wke,raimundo volker,'+56973422210,crecimiento,"Una experiencia que te ayude a descubrir algo nuevo (clases, talleres, etc.)",Jugar videojuegos o ver series,Seguir en Vmica,,,,,,Eventos del mes,,,,"Concierto Sinfónico Star Music / Sábado 21 de diciembre / 21:00 horas / Parque Padre Hurtado, Avenida Francisco Bilbao 8105, La Reina.",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2024-12-11 13:05:59,,2024-12-11 13:33:18,0398fcee34,
inse9z9kq0llyq50byuwinse9zatvry8,Francisca Guerrero,'+56961935252,Alegría,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",Con la familia y amigos,Amor propio,,,,Caja by SoyTe,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2024-12-11 11:36:51,,2024-12-11 11:45:25,fee00e6a1d,
rf2cectrxdsvqsy6hxrf2cectr4bw3xi,Juliana Pavan,'+56998225106,gratitud,"Algo que te dé adrenalina o diversión (deporte, aventura, etc.)",viajar,Seguir haciendo deporte,,,,Caja by SoyTe,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,completed,2024-12-10 23:55:12,,2024-12-10 23:58:27,b47bd7e669,
6izryu9uziydgu2w6izrygzhntb2mmti,Fredy Quezada,'+56953332793,Satisfacción,"Una actividad que te conecte con tus seres queridos (cena, salidas, etc.)",Trekking,Renovar energías,,Comidas del mundo,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,*Domicilio*,Gohan 🍣,,,"Buenaventura poniente 526, Quilicura",No tengo restricción,,completed,2024-12-10 22:06:10,,2024-12-10 22:11:21,414ae089f9,

` 
};

export async function toAskGemini(message, history = []) {
  const messages = [systemMessage, ...history, { role: 'user', content: message }];
  const completion = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages
  });
  return completion.choices[0].message.content;
}