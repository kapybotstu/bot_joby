/**
 * =========================================
 * SERVICIO DE FORMATEO AVANZADO DE DATOS
 * =========================================
 * 
 * Este servicio optimiza el procesamiento de datos de Firebase 
 * para preparar contexto enriquecido para ChatGPT.
 */

import logger, { LogLevel } from '../tools/firebase-logger';

// Constantes para logging
const LOG_CATEGORY = {
  FORMATTER: 'DataFormatter',
  SUMMARY: 'DataSummary',
  CONTEXT: 'ContextBuilder'
};

class DataFormatterService {
  private debugMode: boolean;
  
  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
    
    if (debugMode) {
      logger.configure({ logLevel: LogLevel.DEBUG });
    }
    
    logger.info(LOG_CATEGORY.FORMATTER, 'Inicializando Servicio de Formateo de Datos');
  }
  
  /**
   * Genera un resumen estructurado de los datos para un modelo de interpretación
   */
  generateStructuredContext(commandResults: any[], originalQuery: string): any {
    logger.debug(LOG_CATEGORY.CONTEXT, 'Generando contexto estructurado', {
      resultCount: commandResults.length,
      query: originalQuery.substring(0, 30) + '...'
    });
    
    try {
      // Identificar tipo de datos para análisis especializado
      const context: any = {
        originalQuery,
        summary: {},
        details: {},
        trends: [],
        keywords: this.extractKeywords(originalQuery)
      };
      
      // Procesar cada resultado y clasificarlo
      for (const result of commandResults) {
        if (result.error) continue;
        
        const commandType = this.identifyCommandType(result.command);
        
        switch (commandType) {
          case 'investment': {
            context.summary.investment = this.summarizeInvestment(result.result);
            context.details.investment = result.result;
            break;
          }
          case 'redemption': {
            context.summary.redemption = this.summarizeRedemption(result.result);
            context.details.redemption = result.result;
            break;
          }
          case 'benefit-status': {
            context.summary.benefitStatus = this.summarizeBenefitStatus(result.result);
            context.details.benefitStatus = result.result;
            break;
          }
          case 'active-users': {
            context.summary.activeUsers = this.summarizeActiveUsers(result.result);
            context.details.activeUsers = result.result;
            break;
          }
          case 'top-categories': {
            context.summary.categories = this.summarizeCategories(result.result);
            context.details.categories = result.result;
            break;
          }
          case 'compare-december': {
            context.summary.decemberComparison = this.summarizeDecemberComparison(result.result);
            context.details.decemberComparison = result.result;
            break;
          }
          case 'month-progress': {
            context.summary.monthProgress = result.result;
            break;
          }
          default: {
            // Para otros tipos de comandos, agregar a datos generales
            if (!context.details.general) {
              context.details.general = [];
            }
            context.details.general.push(result);
          }
        }
      }
      
      // Identificar tendencias en los datos
      context.trends = this.identifyTrends(context);
      
      // Enriquecer contexto con métricas clave
      context.keyMetrics = this.extractKeyMetrics(context);
      
      logger.info(LOG_CATEGORY.CONTEXT, 'Contexto estructurado generado', {
        summaryKeys: Object.keys(context.summary),
        trendCount: context.trends.length,
        keyMetricsCount: context.keyMetrics.length
      });
      
      return context;
    } catch (error) {
      logger.error(LOG_CATEGORY.CONTEXT, `Error generando contexto: ${error.message}`, { error });
      
      // Devolver contexto mínimo en caso de error
      return {
        originalQuery,
        rawResults: commandResults,
        error: error.message
      };
    }
  }
  
  /**
   * Identifica el tipo de comando basado en su estructura
   */
  private identifyCommandType(command: string): string {
    if (!command) return 'unknown';
    
    if (command.includes(':investment')) return 'investment';
    if (command.includes(':redemption-rate')) return 'redemption';
    if (command.includes(':historical-rate')) return 'redemption';
    if (command.includes(':benefit-status')) return 'benefit-status';
    if (command.includes(':active-users')) return 'active-users';
    if (command.includes(':top-categories')) return 'top-categories';
    if (command.includes(':compare-december')) return 'compare-december';
    if (command.includes(':month-progress')) return 'month-progress';
    
    return 'general';
  }
  
  /**
   * Extrae palabras clave importantes de la consulta original
   */
  private extractKeywords(query: string): string[] {
    const keywords = [];
    
    // Palabras clave relacionadas con tiempo
    const timeKeywords = ['mes', 'meses', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'actual', 'pasado', 'año'];
    
    // Palabras clave relacionadas con métricas
    const metricKeywords = ['gasto', 'inversión', 'presupuesto', 'tasa', 'porcentaje', 'redemption',
      'canje', 'beneficios', 'canjeados', 'usuarios', 'total', 'costo'];
    
    // Palabras clave relacionadas con intenciones
    const intentKeywords = ['comparar', 'mostrar', 'ver', 'progreso', 'avance', 'estado', 'rendimiento',
      'performance', 'cuánto', 'cuántos', 'mejor', 'peor'];
    
    // Normalizar query
    const normalizedQuery = query.toLowerCase()
      .replace(/[.,;:¿?!¡]/g, '')
      .split(' ');
    
    // Buscar coincidencias
    for (const word of normalizedQuery) {
      if (timeKeywords.includes(word)) {
        keywords.push(`time:${word}`);
      }
      if (metricKeywords.includes(word)) {
        keywords.push(`metric:${word}`);
      }
      if (intentKeywords.includes(word)) {
        keywords.push(`intent:${word}`);
      }
    }
    
    return keywords;
  }
  
  /**
   * Genera un resumen de datos de inversión
   */
  private summarizeInvestment(data: any): any {
    if (!data) return null;
    
    try {
      return {
        month: data.month || 'actual',
        totalInvestment: data.totalInvestment || 0,
        netInvestment: data.netInvestment || 0,
        refundAmount: data.totalRefund || 0,
        refundPercentage: data.totalInvestment ? 
          ((data.totalRefund || 0) / data.totalInvestment * 100).toFixed(2) + '%' : '0%',
        topCategory: data.investmentByCategory && data.investmentByCategory.length > 0 ?
          data.investmentByCategory[0].category : 'No disponible',
        topCategoryAmount: data.investmentByCategory && data.investmentByCategory.length > 0 ?
          data.investmentByCategory[0].investment : 0,
        categoryCount: data.investmentByCategory ? data.investmentByCategory.length : 0
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo inversión: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Genera un resumen de datos de redención
   */
  private summarizeRedemption(data: any): any {
    if (!data) return null;
    
    try {
      // Manejar datos de tasa histórica
      if (data.monthlyRates) {
        const rates = data.monthlyRates.map(r => ({
          month: r.month,
          rate: r.redemptionRate
        }));
        
        // Encontrar mes con mayor tasa
        const bestMonth = [...rates].sort((a, b) => b.rate - a.rate)[0];
        
        // Encontrar mes con menor tasa
        const worstMonth = [...rates].sort((a, b) => a.rate - b.rate)[0];
        
        return {
          type: 'historical',
          globalRate: data.globalRate || 0,
          totalRedeemed: data.totalRedeemed || 0,
          totalBenefits: data.totalBenefits || 0,
          monthCount: rates.length,
          bestMonth: bestMonth ? `${bestMonth.month} (${bestMonth.rate}%)` : 'No disponible',
          worstMonth: worstMonth ? `${worstMonth.month} (${worstMonth.rate}%)` : 'No disponible',
          decemberComparison: data.comparisonWithDecember
        };
      }
      
      // Manejar datos de tasa para una fecha específica
      return {
        type: 'specific',
        date: data.date || 'actual',
        month: data.month || 'actual',
        redemptionRate: data.redemptionRate || 0,
        totalRedeemed: data.totalRedeemed || 0,
        totalBenefits: data.totalBenefits || 0,
        redeemedOnDate: data.redeemedOnDate || 0,
        dailyRate: data.dailyRate || 0
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo redención: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Genera un resumen de datos de estado de beneficios
   */
  private summarizeBenefitStatus(data: any): any {
    if (!data) return null;
    
    try {
      return {
        totalUsers: data.totalUsers || 0,
        usersWithPending: data.pendingCount || 0,
        usersWithUsed: data.usedCount || 0,
        usersWithNotSelected: data.notSelectedCount || 0,
        pendingPercentage: data.totalUsers ? 
          ((data.pendingCount || 0) / data.totalUsers * 100).toFixed(2) + '%' : '0%',
        usedPercentage: data.totalUsers ? 
          ((data.usedCount || 0) / data.totalUsers * 100).toFixed(2) + '%' : '0%',
        pendingUserSample: data.usersWithPendingBenefits && data.usersWithPendingBenefits.length > 0 ?
          data.usersWithPendingBenefits.slice(0, 3).map(u => u.name).join(', ') : 'Ninguno'
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo estado de beneficios: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Genera un resumen de datos de usuarios activos
   */
  private summarizeActiveUsers(data: any): any {
    if (!data) return null;
    
    try {
      let genderDistribution = 'No disponible';
      if (data.byGender && data.byGender.length > 0) {
        genderDistribution = data.byGender.map(g => 
          `${g.gender}: ${g.count} (${g.percentage}%)`
        ).join(', ');
      }
      
      let generationDistribution = 'No disponible';
      if (data.byGeneration && data.byGeneration.length > 0) {
        generationDistribution = data.byGeneration.map(g => 
          `${g.generation}: ${g.count} (${g.percentage}%)`
        ).join(', ');
      }
      
      return {
        month: data.month || 'actual',
        totalActiveUsers: data.totalActiveUsers || 0,
        genderDistribution,
        generationDistribution,
        dominantGender: data.byGender && data.byGender.length > 0 ?
          data.byGender.sort((a, b) => b.count - a.count)[0].gender : 'No disponible',
        dominantGeneration: data.byGeneration && data.byGeneration.length > 0 ?
          data.byGeneration.sort((a, b) => b.count - a.count)[0].generation : 'No disponible'
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo usuarios activos: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Genera un resumen de datos de categorías
   */
  private summarizeCategories(data: any): any {
    if (!data) return null;
    
    try {
      const topCategoriesList = data.topCategories && data.topCategories.length > 0 ?
        data.topCategories.map((c, i) => `${i+1}. ${c.category} (${c.percentage}%)`).join(', ') :
        'No disponible';
      
      return {
        totalCategories: data.totalCategories || 0,
        topCategory: data.topCategories && data.topCategories.length > 0 ?
          `${data.topCategories[0].category} (${data.topCategories[0].percentage}%)` : 'No disponible',
        topCategoriesList,
        topByMonth: data.topCategoryByMonth || [],
        decemberTop: data.comparisonWithDecember && data.comparisonWithDecember.topDecemberCategories ?
          data.comparisonWithDecember.topDecemberCategories.map(c => c.category).join(', ') : 'No disponible'
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo categorías: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Genera un resumen comparativo con diciembre
   */
  private summarizeDecemberComparison(data: any): any {
    if (!data) return null;
    
    try {
      // Calcular dirección de las diferencias
      const totalDiff = data.differences ? data.differences.total : 0;
      const redemptionDiff = data.conclusion ? data.conclusion.redemptionRateDiff : 0;
      const investmentDiff = data.differences ? data.differences.investment : 0;
      
      return {
        decemberTotal: data.december ? data.december.total : 0,
        decemberRedeemed: data.december ? data.december.redeemed : 0,
        decemberRate: data.december ? data.december.redemptionRate : 0,
        decemberInvestment: data.december ? data.december.investment : 0,
        averageOtherMonths: data.otherMonths ? data.otherMonths.avgPerMonth.total : 0,
        averageOtherRedeemed: data.otherMonths ? data.otherMonths.avgPerMonth.redeemed : 0,
        averageOtherRate: data.otherMonths ? data.otherMonths.redemptionRate : 0,
        totalDifference: {
          value: totalDiff,
          percentage: data.percentageDiff ? data.percentageDiff.total : 0,
          isHigher: totalDiff > 0
        },
        redemptionDifference: {
          value: redemptionDiff,
          isHigher: redemptionDiff > 0
        },
        investmentDifference: {
          value: investmentDiff,
          percentage: data.percentageDiff ? data.percentageDiff.investment : 0,
          isHigher: investmentDiff > 0
        }
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error resumiendo comparación: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Identifica tendencias en los datos analizados
   */
  private identifyTrends(context: any): string[] {
    const trends = [];
    
    try {
      // Tendencias de inversión
      if (context.summary.investment) {
        const inv = context.summary.investment;
        
        if (inv.refundAmount > 0 && inv.totalInvestment > 0) {
          const refundPercent = (inv.refundAmount / inv.totalInvestment) * 100;
          if (refundPercent > 30) {
            trends.push(`Alta tasa de devolución (${refundPercent.toFixed(2)}%) sobre inversión total`);
          } else if (refundPercent < 10) {
            trends.push(`Baja tasa de devolución (${refundPercent.toFixed(2)}%) sobre inversión total`);
          }
        }
      }
      
      // Tendencias de redención
      if (context.summary.redemption) {
        const red = context.summary.redemption;
        
        if (red.type === 'specific' && red.redemptionRate > 0) {
          if (red.redemptionRate > 85) {
            trends.push(`Excelente tasa de canje (${red.redemptionRate}%) para ${red.month}`);
          } else if (red.redemptionRate < 50) {
            trends.push(`Baja tasa de canje (${red.redemptionRate}%) para ${red.month}`);
          }
        }
        
        if (red.type === 'historical' && red.globalRate > 0) {
          if (red.globalRate > 85) {
            trends.push(`Excelente tasa de canje histórica (${red.globalRate}%)`);
          } else if (red.globalRate < 50) {
            trends.push(`Tasa de canje histórica por debajo del objetivo (${red.globalRate}%)`);
          }
        }
      }
      
      // Tendencias de comparación con diciembre
      if (context.summary.decemberComparison) {
        const dec = context.summary.decemberComparison;
        
        if (dec.totalDifference.isHigher && dec.totalDifference.percentage > 20) {
          trends.push(`Diciembre tuvo un rendimiento ${dec.totalDifference.percentage}% superior al promedio`);
        } else if (!dec.totalDifference.isHigher && Math.abs(dec.totalDifference.percentage) > 20) {
          trends.push(`Diciembre tuvo un rendimiento ${Math.abs(dec.totalDifference.percentage)}% inferior al promedio`);
        }
        
        if (dec.redemptionDifference.isHigher && dec.redemptionDifference.value > 10) {
          trends.push(`La tasa de canje en diciembre fue ${dec.redemptionDifference.value}% superior al promedio`);
        } else if (!dec.redemptionDifference.isHigher && Math.abs(dec.redemptionDifference.value) > 10) {
          trends.push(`La tasa de canje en diciembre fue ${Math.abs(dec.redemptionDifference.value)}% inferior al promedio`);
        }
      }
      
      // Tendencias de estado de beneficios
      if (context.summary.benefitStatus) {
        const ben = context.summary.benefitStatus;
        
        if (ben.usersWithPending > ben.usersWithUsed && ben.totalUsers > 0) {
          const pendingPercent = (ben.usersWithPending / ben.totalUsers) * 100;
          trends.push(`Alta proporción de beneficios pendientes (${pendingPercent.toFixed(2)}%)`);
        }
        
        if (ben.usersWithNotSelected > 0 && ben.totalUsers > 0) {
          const notSelectedPercent = (ben.usersWithNotSelected / ben.totalUsers) * 100;
          if (notSelectedPercent > 15) {
            trends.push(`Alto porcentaje de usuarios sin seleccionar beneficio (${notSelectedPercent.toFixed(2)}%)`);
          }
        }
      }
      
      logger.debug(LOG_CATEGORY.SUMMARY, `Identificadas ${trends.length} tendencias en los datos`);
      
      return trends;
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error identificando tendencias: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Extrae métricas clave para el análisis
   */
  private extractKeyMetrics(context: any): any[] {
    const metrics = [];
    
    try {
      // Métricas de inversión
      if (context.summary.investment) {
        metrics.push({
          name: 'Total inversión',
          value: context.summary.investment.totalInvestment,
          context: `para ${context.summary.investment.month}`
        });
        
        metrics.push({
          name: 'Inversión neta',
          value: context.summary.investment.netInvestment,
          context: `después de devoluciones`
        });
      }
      
      // Métricas de redención
      if (context.summary.redemption) {
        if (context.summary.redemption.type === 'specific') {
          metrics.push({
            name: 'Tasa de canje',
            value: `${context.summary.redemption.redemptionRate}%`,
            context: `para ${context.summary.redemption.month}`
          });
        } else {
          metrics.push({
            name: 'Tasa histórica',
            value: `${context.summary.redemption.globalRate}%`,
            context: 'promedio general'
          });
        }
      }
      
      // Métricas de usuarios
      if (context.summary.activeUsers) {
        metrics.push({
          name: 'Usuarios activos',
          value: context.summary.activeUsers.totalActiveUsers,
          context: `en ${context.summary.activeUsers.month}`
        });
      }
      
      // Métricas de estado
      if (context.summary.benefitStatus) {
        metrics.push({
          name: 'Beneficios canjeados',
          value: context.summary.benefitStatus.usersWithUsed,
          context: `de ${context.summary.benefitStatus.totalUsers} totales`
        });
        
        metrics.push({
          name: 'Beneficios pendientes',
          value: context.summary.benefitStatus.usersWithPending,
          context: `de ${context.summary.benefitStatus.totalUsers} totales`
        });
      }
      
      // Métricas de progreso
      if (context.summary.monthProgress) {
        metrics.push({
          name: 'Progreso del mes',
          value: `${context.summary.monthProgress.progress}%`,
          context: `día ${context.summary.monthProgress.currentDay} de ${context.summary.monthProgress.lastDay}`
        });
      }
      
      logger.debug(LOG_CATEGORY.SUMMARY, `Extraídas ${metrics.length} métricas clave`);
      
      return metrics;
    } catch (error) {
      logger.error(LOG_CATEGORY.SUMMARY, `Error extrayendo métricas: ${error.message}`);
      return [];
    }
  }
}

export default DataFormatterService;