/**
 * =========================================
 * ADAPTADOR DE GEMINI PARA SISTEMA VMICA
 * =========================================
 * 
 * Este adaptador permite integrar Gemini con la infraestructura existente
 * que actualmente usa ChatGPT, manteniendo compatibilidad con todos los sistemas.
 */

import axios from 'axios';
import EnhancedFirebaseService from './enhanced-firebase-service';
import logger, { LogLevel } from '../tools/firebase-logger';

// Constantes de logging
const LOG_CATEGORY = {
  GEMINI: 'Gemini',
  GPT: 'ChatGPT', 
  ADAPTER: 'GeminiAdapter',
  COMMANDS: 'Commands',
  PERFORMANCE: 'Performance'
};

interface ModelConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

class GeminiAdapter {
  private geminiConfig: ModelConfig;
  private gptConfig: ModelConfig;
  private firebaseService: EnhancedFirebaseService;
  private geminiPrompt: string;
  private gptPrompt: string;
  private debugMode: boolean;
  private requestCounter: number = 0;
  private totalGeminiTime: number = 0;
  private totalGptTime: number = 0;
  private totalCommandTime: number = 0;
  private totalRequestTime: number = 0;
  
  constructor(
    geminiConfig: ModelConfig,
    gptConfig: ModelConfig,
    firebaseConfig: any,
    useLocalStorage: boolean = false,
    debugMode: boolean = false
  ) {
    this.geminiConfig = geminiConfig;
    this.gptConfig = gptConfig;
    this.debugMode = debugMode;
    
    if (debugMode) {
      logger.configure({ logLevel: LogLevel.DEBUG });
    }
    
    this.firebaseService = new EnhancedFirebaseService(firebaseConfig, useLocalStorage, debugMode);
    
    logger.info(LOG_CATEGORY.ADAPTER, 'Inicializando Adapter de Gemini', {
      geminiModel: geminiConfig.model,
      gptModel: gptConfig.model
    });
    
    // Gemini es optimizado para análisis de intenciones y generación de comandos
    this.geminiPrompt = `
    Eres un especialista en análisis de consultas para un sistema de beneficios
    empresariales llamado VMICA.
    
    INSTRUCCIONES CRÍTICAS:
    - SOLO genera el objeto JSON de respuesta exactamente como se solicita
    - Analiza la intención del usuario y genera los comandos Firebase apropiados
    - Mapea las intenciones a los comandos correctos según la lista proporcionada
    
    MAPEO DE INTENCIONES A COMANDOS:
    1. INTENCIÓN: Conocer gastos/costos/dinero gastado
       COMANDO: "firebase:analytics:investment:month=[mes]"
       
    2. INTENCIÓN: Saber inversión/presupuesto/recursos utilizados
       COMANDO: "firebase:analytics:investment:month=[mes]"
       
    3. INTENCIÓN: Ver beneficios utilizados/canjeados/reclamados
       COMANDO: "firebase:analytics:benefit-status:month=[mes]"
       
    4. INTENCIÓN: Comparar rendimiento entre periodos
       COMANDO: "firebase:analytics:compare-december" (si incluye diciembre)
       
    5. INTENCIÓN: Conocer progreso/avance del mes
       COMANDO: "firebase:analytics:month-progress"
       
    6. INTENCIÓN: Saber tasas/porcentajes de utilización
       COMANDO: "firebase:analytics:redemption-rate"
       
    OPERACIONES DE ANALYTICS (la base de datos se llama jobby por si el usario pregunta)DISPONIBLES:
    - "firebase:analytics:month-progress" - Porcentaje de avance del mes actual
    - "firebase:analytics:redemption-rate" - Tasa de canje al día actual o especificado
    - "firebase:analytics:redemption-rate:date=DD/MM/YYYY" - Tasa de canje para una fecha específica
    - "firebase:analytics:historical-rate" - Porcentaje histórico de canje de todos los meses
    - "firebase:analytics:benefit-status" - Quiénes tienen beneficios pendientes y quiénes ya usaron
    - "firebase:analytics:benefit-status:month=mes" - Estado de beneficios filtrado por mes específico
    - "firebase:analytics:active-users" - Total de usuarios activos en el mes actual
    - "firebase:analytics:active-users:month=mes" - Total de usuarios activos en un mes específico
    - "firebase:analytics:investment" - Inversión y devolución en el mes actual
    - "firebase:analytics:investment:month=mes" - Inversión y devolución en un mes específico
    - "firebase:analytics:top-categories" - Top categorías de beneficios
    - "firebase:analytics:compare-december" - Comparación de diciembre con otros meses
    
    Tu respuesta debe tener EXACTAMENTE este formato JSON:
    {
        "userMessage": "Estoy analizando esa información para ti. Dame un momento...",
        "commands": ["firebase:comando1", "firebase:comando2"]
    }
    `;
    
    // Para mantener compatibilidad con el sistema existente, 
    // usamos ChatGPT para la interpretación final de resultados
    this.gptPrompt = `
    Eres Kapy, un asistente virtual para de jobby. Has recibido los resultados
    de una consulta a la base de datos y necesitas interpretarlos.
    
    DATOS A INTERPRETAR:
    [CONSULTA_ORIGINAL]: {consulta}
    [RESULTADOS_FIREBASE]: {resultados}
    
    LINEAMIENTOS PARA TU RESPUESTA:
    - Responde de manera conversacional y amigable
    - Resume la información clave de forma clara
    - Destaca tendencias o patrones importantes
    - Mantén un tono positivo y constructivo
    
    Tu respuesta debe ser natural y enfocada en lo que el usuario preguntó.
    `;
  }
  
  /**
   * Procesa un mensaje en el flujo de tres pasos:
   * 1. Gemini: Análisis y generación de comandos
   * 2. Firebase: Ejecución de comandos y obtención de datos
   * 3. ChatGPT: Interpretación y respuesta final
   */
  async processMessage(message: string, userId: string): Promise<string> {
    const startTime = Date.now();
    this.requestCounter++;
    
    try {
      logger.info(LOG_CATEGORY.ADAPTER, `Procesando mensaje: "${message.substring(0, 50)}..."`, { userId });
      
      // PASO 1: Gemini analiza la consulta y genera comandos
      const geminiStartTime = performance.now();
      const geminiResponse = await this.queryGemini(message);
      const geminiTime = performance.now() - geminiStartTime;
      this.totalGeminiTime += geminiTime;
      
      logger.info(LOG_CATEGORY.GEMINI, `Gemini completó análisis en ${geminiTime.toFixed(2)}ms`, {
        commandsGenerated: geminiResponse.commands.length
      });
      
      // Si no hay comandos, usar mensaje predeterminado
      if (!geminiResponse.commands || geminiResponse.commands.length === 0) {
        return geminiResponse.userMessage || "No pude entender completamente tu consulta. ¿Podrías ser más específico?";
      }
      
      // PASO 2: Ejecutar comandos Firebase
      const firebaseStartTime = performance.now();
      const commandResults = await this.firebaseService.executeCommands(geminiResponse.commands);
      const firebaseTime = performance.now() - firebaseStartTime;
      this.totalCommandTime += firebaseTime;
      
      logger.info(LOG_CATEGORY.COMMANDS, `Firebase ejecutó comandos en ${firebaseTime.toFixed(2)}ms`, {
        resultCount: commandResults.length
      });
      
      // PASO 3: ChatGPT interpreta los resultados y genera respuesta final
      const gptStartTime = performance.now();
      const interpretedResponse = await this.interpretResults(message, commandResults, geminiResponse.userMessage);
      const gptTime = performance.now() - gptStartTime;
      this.totalGptTime += gptTime;
      
      logger.info(LOG_CATEGORY.GPT, `ChatGPT generó interpretación en ${gptTime.toFixed(2)}ms`, {
        responseLength: interpretedResponse.length
      });
      
      // Log de rendimiento general
      const totalTime = Date.now() - startTime;
      this.totalRequestTime += totalTime;
      
      logger.info(LOG_CATEGORY.PERFORMANCE, `Procesamiento completo en ${(geminiTime + firebaseTime + gptTime).toFixed(2)}ms`, {
        geminiTime,
        firebaseTime,
        gptTime,
        totalTime
      });
      
      return interpretedResponse;
    } catch (error) {
      logger.error(LOG_CATEGORY.ADAPTER, `Error en procesamiento: ${error.message}`, { error });
      return "Lo siento, ocurrió un error al procesar tu consulta. Por favor, intenta nuevamente.";
    }
  }
  
  /**
   * Consulta a Gemini para análisis de intención y generación de comandos
   */
  private async queryGemini(message: string): Promise<{
    userMessage: string;
    commands: string[];
  }> {
    try {
      // Verificar si tenemos API key para Gemini
      if (!this.geminiConfig.apiKey) {
        logger.warn(LOG_CATEGORY.GEMINI, "No se configuró API key para Gemini, usando simulación");
        return this.simulateGeminiResponse(message);
      }
      
      // Implementación real de llamada a API de Gemini
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiConfig.model}:generateContent`,
        {
          contents: [{
            parts: [{
              text: `${this.geminiPrompt}\n\nConsulta del usuario: "${message}"`
            }]
          }],
          generationConfig: {
            maxOutputTokens: this.geminiConfig.maxTokens,
            temperature: this.geminiConfig.temperature
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.geminiConfig.apiKey
          }
        }
      );
      
      // Extraer y parsear JSON de la respuesta de Gemini
      const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("No se pudo extraer JSON de la respuesta de Gemini");
      }
      
      const parsedContent = JSON.parse(jsonMatch[0]);
      
      return {
        userMessage: parsedContent.userMessage || "Estoy procesando tu consulta...",
        commands: Array.isArray(parsedContent.commands) ? parsedContent.commands : []
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.GEMINI, `Error en llamada a Gemini: ${error.message}`, { error });
      
      // Proporcionar respuesta por defecto en caso de error
      return this.simulateGeminiResponse(message);
    }
  }
  
  /**
   * Simula una respuesta de Gemini cuando no hay API key disponible
   */
  private simulateGeminiResponse(message: string): {
    userMessage: string;
    commands: string[];
  } {
    logger.debug(LOG_CATEGORY.GEMINI, "Simulando respuesta de Gemini");
    
    // Palabras clave para inferir comandos
    const lowerMessage = message.toLowerCase();
    const commands: string[] = [];
    
    // Detectar si hay mes específico mencionado
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    let targetMonth = months[new Date().getMonth()]; // Por defecto, mes actual
    let monthSpecified = false;
    
    // Buscar menciones de meses
    for (const month of months) {
      if (lowerMessage.includes(month)) {
        targetMonth = month;
        monthSpecified = true;
        break;
      }
    }
    
    // Menciones de tiempo relativo
    if (lowerMessage.includes('mes pasado')) {
      const currentMonth = new Date().getMonth();
      targetMonth = months[currentMonth > 0 ? currentMonth - 1 : 11];
      monthSpecified = true;
    } else if (lowerMessage.includes('este mes') || lowerMessage.includes('mes actual')) {
      targetMonth = months[new Date().getMonth()];
      monthSpecified = true;
    }
    
    // Detectar categorías comunes
    const categories = [
      'comidas', 'comida', 'mundo', 'comidas por el mundo', 
      'experiencias', 'bienestar', 'fitness', 'cultura', 'deporte',
      'salud', 'entretenimiento', 'libros', 'tech', 'tecnología'
    ];
    
    let categoryDetected = false;
    
    // Detectar si hay una mención de categoría
    for (const category of categories) {
      if (lowerMessage.includes(category)) {
        categoryDetected = true;
        break;
      }
    }
    
    // Inferir comandos basados en palabras clave y contexto
    if (lowerMessage.includes('inversión') || lowerMessage.includes('gasto') || 
        lowerMessage.includes('dinero') || lowerMessage.includes('presupuesto')) {
      // Priorizar consulta por inversión con mes específico
      commands.push(`firebase:analytics:investment:month=${targetMonth}`);
    }
    else if (categoryDetected && monthSpecified) {
      // Si se especifica categoría y mes, buscar beneficios con esos filtros
      commands.push(`firebase:query:userBenefits:Categoria=Comidas del Mundo,Mes_de_beneficio=${targetMonth}`);
    }
    else if (categoryDetected) {
      // Si solo se menciona categoría, buscar beneficios por categoría
      commands.push(`firebase:query:userBenefits:Categoria=Comidas del Mundo`);
    }
    else if (monthSpecified) {
      // Si solo se menciona mes, buscar por beneficios en ese mes específico
      commands.push(`firebase:query:userBenefits:Mes_de_beneficio=${targetMonth}`);
      // También podemos obtener datos analíticos por mes
      commands.push(`firebase:analytics:investment:month=${targetMonth}`);
    }
    else if (lowerMessage.includes('beneficio') || lowerMessage.includes('canje')) {
      commands.push(`firebase:analytics:benefit-status:month=${targetMonth}`);
    }
    else if (lowerMessage.includes('tasa') || lowerMessage.includes('porcentaje')) {
      commands.push(`firebase:analytics:redemption-rate`);
    }
    else if (lowerMessage.includes('progreso') || lowerMessage.includes('avance')) {
      commands.push(`firebase:analytics:month-progress`);
    }
    else if (lowerMessage.includes('comparar') || lowerMessage.includes('diciembre')) {
      commands.push(`firebase:analytics:compare-december`);
    }
    else if (lowerMessage.includes('categoría') || lowerMessage.includes('tipo')) {
      commands.push(`firebase:analytics:top-categories`);
    }
    else if (lowerMessage.includes('usuario') || lowerMessage.includes('personas')) {
      commands.push(`firebase:analytics:active-users:month=${targetMonth}`);
    }
    else {
      // Comando por defecto si no se detecta intención clara
      commands.push(`firebase:analytics:month-progress`);
    }
    
    return {
      userMessage: "Estoy analizando esa información para ti. Dame un momento...",
      commands
    };
  }
  
  /**
   * Usa ChatGPT para interpretar los resultados y generar respuesta final
   */
  private async interpretResults(
    originalQuery: string, 
    commandResults: any[],
    defaultMessage: string
  ): Promise<string> {
    try {
      // Si no hay resultados o todos son errores, usar mensaje predeterminado
      if (!commandResults || commandResults.length === 0 || commandResults.every(r => r.error)) {
        return defaultMessage || "No pude encontrar información relevante para tu consulta.";
      }
      
      // Formatear resultados para el prompt de ChatGPT
      const formattedResults = commandResults
        .filter(r => !r.error && r.result)
        .map(r => `Comando: ${r.command}\nResultado: ${JSON.stringify(r.result, null, 2)}`)
        .join("\n\n");
      
      if (!formattedResults) {
        return defaultMessage || "No pude encontrar información relevante para tu consulta.";
      }
      
      // Verificar si tenemos API key para ChatGPT
      if (!this.gptConfig.apiKey) {
        logger.warn(LOG_CATEGORY.GPT, "No se configuró API key para ChatGPT, usando respuesta predeterminada");
        return this.formatResponseWithoutGpt(commandResults, defaultMessage);
      }
      
      // Construir prompt específico para interpretación
      const interpretationPrompt = this.gptPrompt
        .replace('{consulta}', originalQuery)
        .replace('{resultados}', formattedResults);
      
      // Llamar a ChatGPT para interpretar
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.gptConfig.model,
          messages: [
            {
              role: "system",
              content: interpretationPrompt
            }
          ],
          max_tokens: this.gptConfig.maxTokens,
          temperature: this.gptConfig.temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.gptConfig.apiKey}`
          }
        }
      );
      
      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error(LOG_CATEGORY.GPT, `Error en interpretación: ${error.message}`, { error });
      return this.formatResponseWithoutGpt(commandResults, defaultMessage);
    }
  }
  
  /**
   * Formatea una respuesta básica cuando no se puede usar ChatGPT
   */
  private formatResponseWithoutGpt(commandResults: any[], defaultMessage: string): string {
    try {
      // Si no hay resultados válidos, retornar mensaje predeterminado
      const validResults = commandResults.filter(r => !r.error && r.result);
      if (validResults.length === 0) {
        return defaultMessage;
      }
      
      // Extraer información relevante del primer resultado válido
      const firstResult = validResults[0];
      const command = firstResult.command;
      const result = firstResult.result;
      
      // Formar respuesta según el tipo de comando
      let response = "Aquí está la información que solicitaste:\n\n";
      
      if (command.includes('investment')) {
        response = `La inversión total ${result.month ? 'en ' + result.month : ''} fue de $${result.totalInvestment || 0}. `;
        
        if (result.totalRefund > 0) {
          response += `Se registraron devoluciones por $${result.totalRefund}, resultando en una inversión neta de $${result.totalInvestment - result.totalRefund}. `;
        }
        
        if (result.investmentByCategory && result.investmentByCategory.length > 0) {
          response += `\n\nLas categorías principales de inversión fueron:\n`;
          result.investmentByCategory.slice(0, 3).forEach((cat, index) => {
            response += `${index + 1}. ${cat.category}: $${cat.investment} (${cat.percentage}%)\n`;
          });
        }
      }
      else if (command.includes('benefit-status')) {
        response = `Estado actual de beneficios:\n`;
        response += `- Total de usuarios: ${result.totalUsers || 0}\n`;
        response += `- Usuarios con beneficios pendientes: ${result.pendingCount || 0}\n`;
        response += `- Usuarios con beneficios usados: ${result.usedCount || 0}\n`;
        
        if (result.notSelectedCount > 0) {
          response += `- Usuarios sin selección: ${result.notSelectedCount}\n`;
        }
      }
      else if (command.includes('redemption-rate')) {
        if (result.type === 'historical') {
          response = `La tasa de canje histórica es ${result.globalRate || 0}%.\n`;
          
          if (result.monthlyRates && result.monthlyRates.length > 0) {
            response += `\nDetalle por mes:\n`;
            result.monthlyRates.slice(0, 5).forEach(month => {
              response += `- ${month.month}: ${month.redemptionRate}%\n`;
            });
          }
        } else {
          response = `La tasa de canje para ${result.month || 'el mes actual'} es ${result.redemptionRate || 0}%.\n`;
          response += `Se han canjeado ${result.totalRedeemed || 0} de ${result.totalBenefits || 0} beneficios.`;
        }
      }
      else if (command.includes('month-progress')) {
        response = `Progreso del mes ${result.month || 'actual'}: ${result.progress || 0}%.\n`;
        response += `Estamos en el día ${result.currentDay} de ${result.lastDay}.`;
      }
      else if (command.includes('compare-december')) {
        response = `Comparación de diciembre con otros meses:\n\n`;
        
        if (result.december) {
          response += `Diciembre:\n`;
          response += `- Total de beneficios: ${result.december.total || 0}\n`;
          response += `- Tasa de canje: ${result.december.redemptionRate || 0}%\n`;
          
          if (result.otherMonths) {
            response += `\nPromedios de otros meses:\n`;
            response += `- Total de beneficios: ${result.otherMonths.avgPerMonth?.total || 0}\n`;
            response += `- Tasa de canje: ${result.otherMonths.redemptionRate || 0}%\n`;
          }
          
          if (result.conclusion) {
            const diff = result.conclusion.redemptionRateDiff || 0;
            const direction = diff > 0 ? 'mayor' : 'menor';
            response += `\nDiciembre tuvo una tasa de canje ${Math.abs(diff).toFixed(2)}% ${direction} que el promedio de otros meses.`;
          }
        }
      }
      else {
        // Para otros tipos de comandos, mostrar resumen genérico
        response = `Se encontraron resultados para tu consulta.\n\n`;
        response += `${JSON.stringify(result, null, 2).substring(0, 500)}`;
        
        if (JSON.stringify(result).length > 500) {
          response += `...\n\n(Resultado resumido)`;
        }
      }
      
      return response;
    } catch (error) {
      logger.error(LOG_CATEGORY.GPT, `Error formateando respuesta sin GPT: ${error.message}`, { error });
      return defaultMessage || "Encontré información pero tuve problemas al formatearla. Por favor, intenta con una consulta más específica.";
    }
  }
  
  /**
   * Obtener estadísticas de rendimiento
   */
  getPerformanceStats(): any {
    return {
      totalRequests: this.requestCounter,
      averageGeminiTime: this.requestCounter > 0 ? this.totalGeminiTime / this.requestCounter : 0,
      averageGptTime: this.requestCounter > 0 ? this.totalGptTime / this.requestCounter : 0,
      averageCommandTime: this.requestCounter > 0 ? this.totalCommandTime / this.requestCounter : 0,
      averageTotalTime: this.requestCounter > 0 ? this.totalRequestTime / this.requestCounter : 0,
      modelSplit: {
        geminiPercentage: this.totalRequestTime > 0 ? (this.totalGeminiTime / this.totalRequestTime) * 100 : 0,
        firebasePercentage: this.totalRequestTime > 0 ? (this.totalCommandTime / this.totalRequestTime) * 100 : 0,
        gptPercentage: this.totalRequestTime > 0 ? (this.totalGptTime / this.totalRequestTime) * 100 : 0
      },
      firebaseStats: this.firebaseService.getConnectionStats()
    };
  }
  
  /**
   * Verifica si Firebase está conectado
   */
  isConnected(): boolean {
    return this.firebaseService.isFirebaseConnected();
  }
}

export default GeminiAdapter;