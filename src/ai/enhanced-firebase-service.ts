import { initializeApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  update, 
  query as rtdbQuery, 
  orderByChild, 
  equalTo,
  startAt,
  endAt
} from 'firebase/database';
import logger from './firebase-logger';


interface CategoryData {
  count: number;
  redeemed?: number;
  investment?: number;
  months?: number;
}

interface BenefitData {
  id?: string;
  Id_usuario?: string | number;
  Nombre?: string;
  Mes_de_beneficio?: string;
  Beneficio_seleccionado?: string;
  Estado?: string;
  Fecha_de_eleccion?: string;
  Categoria?: string;
  Generacion?: string;
  H_M?: string;
  Inversion?: number;
  Devolucion?: number;
  Proveedor_beneficio?: string;
}

// Asumimos que LogLevel está exportado desde firebase-logger
const { LogLevel } = await import('./firebase-logger');

// Constantes para categorías de logging
const LOG_CATEGORY = {
  CONNECTION: 'Firebase:Connection',
  QUERY: 'Firebase:Query',
  DOCUMENT: 'Firebase:Document',
  SESSION: 'Firebase:Session',
  FORMATTER: 'Firebase:Formatter',
  PARSER: 'Firebase:Parser',
  ANALYTICS: 'Firebase:Analytics'
};

/**
 * Servicio mejorado de Firebase con soporte para RTDB y Analytics
 */
export class EnhancedFirebaseService {
  private firebaseApp;
  private rtdb;
  private isConnected = false;
  private userSessions = new Map();
  private useLocalStorage = false;
  private debugMode = false;
  private connectionTimestamp = 0;
  private lastOperationTimestamp = 0;
  private operationCount = 0;
  private queryTimes = [];
  private cachedData = null;
  private lastDataFetch = 0;
  private cacheTTL = 300000; // 5 minutos en milisegundos

  /**
   * Inicializa Firebase con la configuración proporcionada
   */
  constructor(config, useLocalStorage = false, debugMode = false) {
    this.useLocalStorage = useLocalStorage;
    this.debugMode = debugMode;
    
    if (debugMode) {
      logger.configure({ logLevel: LogLevel.DEBUG });
    }

    try {
      logger.info(LOG_CATEGORY.CONNECTION, 'Inicializando conexión a Firebase');
      this.connectionTimestamp = Date.now();
      
      // Inicializar app de Firebase
      this.firebaseApp = initializeApp(config);
      
      // Inicializar Realtime Database
      this.rtdb = getDatabase(this.firebaseApp);
      
      this.isConnected = true;
      
      const connectionTime = Date.now() - this.connectionTimestamp;
      logger.info(LOG_CATEGORY.CONNECTION, `Firebase inicializado correctamente en ${connectionTime}ms`);
    } catch (error) {
      logger.error(LOG_CATEGORY.CONNECTION, 'Error al inicializar Firebase', { error });
      this.isConnected = false;
    }
  }

  /**
   * Verifica si Firebase está conectado y disponible
   */
  isFirebaseConnected() {
    return this.isConnected;
  }

  /**
   * Obtiene estadísticas de conexión
   */
  getConnectionStats() {
    return {
      connectionTime: this.connectionTimestamp ? new Date(this.connectionTimestamp).toISOString() : null,
      connectionAge: this.connectionTimestamp ? Date.now() - this.connectionTimestamp : 0,
      isConnected: this.isConnected,
      operationCount: this.operationCount,
      lastOperationTime: this.lastOperationTimestamp ? new Date(this.lastOperationTimestamp).toISOString() : null,
      lastOperationAge: this.lastOperationTimestamp ? Date.now() - this.lastOperationTimestamp : 0,
      averageQueryTime: this.queryTimes.length > 0 ? 
        this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length : 
        0,
      queriesExecuted: this.queryTimes.length
    };
  }

  /**
   * Parse query parameters with operators (category=electronics,price<1000)
   */
  private parseQueryParams(paramsString: string): Array<{field: string, operator: string, value: any}> {
    if (!paramsString) return [];
    
    logger.debug(LOG_CATEGORY.PARSER, `Parseando parámetros de consulta: ${paramsString}`);
    
    const result: Array<{field: string, operator: string, value: any}> = [];
    const params = paramsString.split(',');
    
    for (const param of params) {
      // Check for operators: =, <, >, <=, >=, !=
      const operatorMatch = param.match(/([^<>=!]+)([<>=!]{1,2})(.+)/);
      
      if (operatorMatch) {
        const [, field, operator, valueStr] = operatorMatch;
        
        // Convert symbols to Firebase operators
        let firestoreOperator;
        switch (operator) {
          case '=': {
            firestoreOperator = '=='; 
            break;
          }
          case '<': {
            firestoreOperator = '<'; 
            break;
          }
          case '>': {
            firestoreOperator = '>'; 
            break;
          }
          case '<=': {
            firestoreOperator = '<='; 
            break;
          }
          case '>=': {
            firestoreOperator = '>='; 
            break;
          }
          case '!=': {
            firestoreOperator = '!='; 
            break;
          }
          default: {
            firestoreOperator = '==';
            break;
          }
        }
        
        // Convert value to appropriate type
        let value = valueStr;
        if (valueStr === 'true') {
          value = true;
        } else if (valueStr === 'false') {
          value = false;
        } else if (!isNaN(Number(valueStr))) {
          value = Number(valueStr);
        }
        
        result.push({
          field: field.trim(),
          operator: firestoreOperator,
          value
        });
      } else {
        // Default to equality check if no operator found
        const parts = param.split('=');
        if (parts.length === 2) {
          const field = parts[0];
          const valueStr = parts[1];
          
          // Convert value to appropriate type
          let value = valueStr;
          if (valueStr === 'true') {
            value = true;
          } else if (valueStr === 'false') {
            value = false;
          } else if (!isNaN(Number(valueStr))) {
            value = Number(valueStr);
          }
          
          result.push({
            field: field.trim(),
            operator: '==',
            value
          });
        }
      }
    }
    
    logger.debug(LOG_CATEGORY.PARSER, `Parámetros parseados:`, { result });
    return result;
  }

  /**
   * Calcula el porcentaje de avance del mes actual
   */
  async getMonthProgress(currentDate = new Date()) {
    const currentDay = currentDate.getDate();
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const progress = Math.floor((currentDay / lastDay) * 100);
    
    logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando progreso del mes: ${progress}%`, {
      currentDay,
      lastDay,
      progress
    });
    
    return {
      currentDay,
      lastDay,
      progress,
      month: currentDate.toLocaleString('es', { month: 'long' })
    };
  }

  /**
   * Obtiene la tasa de canje para una fecha específica o el día actual
   */
  async getRedemptionRate(date = new Date(), useCache = true) {
    try {
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      const dateStr = date.toLocaleDateString('es');
      
      // Mapear meses a español
      const monthsInSpanish = {
        'january': 'enero',
        'february': 'febrero',
        'march': 'marzo',
        'april': 'abril',
        'may': 'mayo',
        'june': 'junio',
        'july': 'julio',
        'august': 'agosto',
        'september': 'septiembre',
        'october': 'octubre',
        'november': 'noviembre',
        'december': 'diciembre'
      };
      
      // Obtener el mes actual en español
      const currentMonthEn = date.toLocaleString('en', { month: 'long' }).toLowerCase();
      const currentMonth = monthsInSpanish[currentMonthEn];
      
      // Filtrar los beneficios para el mes actual
      const currentMonthBenefits = benefitsData.filter(benefit => 
        benefit.Mes_de_beneficio && benefit.Mes_de_beneficio.toLowerCase() === currentMonth
      );
      
      // Contar beneficios redimidos para el mes actual
      const redeemedBenefits = currentMonthBenefits.filter(benefit => 
        benefit.Estado && 
        (benefit.Estado === 'Canjeado' || benefit.Estado === 'Entregado')
      );
      
      // Calcular tasa de canje
      const totalBenefits = currentMonthBenefits.length;
      const totalRedeemed = redeemedBenefits.length;
      const redemptionRate = totalBenefits > 0 ? (totalRedeemed / totalBenefits) * 100 : 0;
      
      // Obtener beneficios redimidos para la fecha específica
      const benefitsRedeemedOnDate = redeemedBenefits.filter(benefit => {
        if (!benefit.Fecha_de_eleccion) return false;
        const benefitDate = this.parseDate(benefit.Fecha_de_eleccion);
        return benefitDate && benefitDate.toLocaleDateString('es') === dateStr;
      });
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando tasa de canje para ${dateStr}`, {
        totalBenefits,
        totalRedeemed,
        redemptionRate,
        redeemedOnDate: benefitsRedeemedOnDate.length
      });
      
      return {
        date: dateStr,
        month: currentMonth,
        totalBenefits,
        totalRedeemed,
        redemptionRate: parseFloat(redemptionRate.toFixed(2)),
        redeemedOnDate: benefitsRedeemedOnDate.length,
        dailyRate: totalBenefits > 0 ? parseFloat((benefitsRedeemedOnDate.length / totalBenefits * 100).toFixed(2)) : 0
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al calcular tasa de canje: ${error.message}`, { error });
      return { error: `Error al calcular tasa de canje: ${error.message}` };
    }
  }

  /**
   * Obtiene la tasa de canje histórica para todos los meses
   */
  async getHistoricalRedemptionRate(useCache = true) {
    try {
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      // Agrupar beneficios por mes
      const benefitsByMonth = benefitsData.reduce((acc, benefit) => {
        if (!benefit.Mes_de_beneficio || benefit.Mes_de_beneficio === 'N/A') return acc;
        
        const month = benefit.Mes_de_beneficio.toLowerCase();
        if (!acc[month]) {
          acc[month] = {
            total: 0,
            redeemed: 0,
            pending: 0,
            notSelected: 0
          };
        }
        
        acc[month].total++;
        
        if (benefit.Estado) {
          const status = benefit.Estado.toLowerCase();
          if (status === 'canjeado' || status === 'entregado') {
            acc[month].redeemed++;
          } else if (status === 'pendiente') {
            acc[month].pending++;
          } else if (status === 'no seleccionó') {
            acc[month].notSelected++;
          }
        }
        
        return acc;
      }, {});
      
      // Calcular tasas para cada mes
      const monthlyRates = Object.keys(benefitsByMonth).map(month => {
        const monthData = benefitsByMonth[month];
        const redemptionRate = monthData.total > 0 ? (monthData.redeemed / monthData.total) * 100 : 0;
        const pendingRate = monthData.total > 0 ? (monthData.pending / monthData.total) * 100 : 0;
        const notSelectedRate = monthData.total > 0 ? (monthData.notSelected / monthData.total) * 100 : 0;
        
        return {
          month,
          total: monthData.total,
          redeemed: monthData.redeemed,
          pending: monthData.pending,
          notSelected: monthData.notSelected,
          redemptionRate: parseFloat(redemptionRate.toFixed(2)),
          pendingRate: parseFloat(pendingRate.toFixed(2)),
          notSelectedRate: parseFloat(notSelectedRate.toFixed(2))
        };
      });
      
      // Calcular tasa global
      const totalBenefits = benefitsData.filter(b => b.Mes_de_beneficio && b.Mes_de_beneficio !== 'N/A').length;
      const totalRedeemed = benefitsData.filter(b => 
        b.Estado && 
        (b.Estado === 'Canjeado' || b.Estado === 'Entregado') && 
        b.Mes_de_beneficio && 
        b.Mes_de_beneficio !== 'N/A'
      ).length;
      
      const globalRate = totalBenefits > 0 ? (totalRedeemed / totalBenefits) * 100 : 0;
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando tasa de canje histórica`, {
        totalMonths: Object.keys(benefitsByMonth).length,
        totalBenefits,
        totalRedeemed,
        globalRate
      });
      
      // Comparar diciembre con otros meses
      const decemberData = benefitsByMonth['diciembre'];
      const otherMonths = Object.keys(benefitsByMonth).filter(month => month !== 'diciembre');
      
      let comparisonWithDecember = null;
      if (decemberData && otherMonths.length > 0) {
        const decemberRate = decemberData.total > 0 ? (decemberData.redeemed / decemberData.total) * 100 : 0;
        
        // Calcular tasa promedio de otros meses
        let otherMonthsTotal = 0;
        let otherMonthsRedeemed = 0;
        
        otherMonths.forEach(month => {
          otherMonthsTotal += benefitsByMonth[month].total;
          otherMonthsRedeemed += benefitsByMonth[month].redeemed;
        });
        
        const otherMonthsRate = otherMonthsTotal > 0 ? (otherMonthsRedeemed / otherMonthsTotal) * 100 : 0;
        const difference = decemberRate - otherMonthsRate;
        
        comparisonWithDecember = {
          decemberRate: parseFloat(decemberRate.toFixed(2)),
          otherMonthsRate: parseFloat(otherMonthsRate.toFixed(2)),
          difference: parseFloat(difference.toFixed(2)),
          percentageDifference: parseFloat((difference / otherMonthsRate * 100).toFixed(2)),
          isHigher: difference > 0
        };
      }
      
      return {
        monthlyRates: monthlyRates.sort((a, b) => {
          const monthOrder = {
            'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 
            'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8, 
            'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
          };
          return monthOrder[a.month] - monthOrder[b.month];
        }),
        totalBenefits,
        totalRedeemed,
        globalRate: parseFloat(globalRate.toFixed(2)),
        comparisonWithDecember
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al calcular tasa histórica: ${error.message}`, { error });
      return { error: `Error al calcular tasa histórica: ${error.message}` };
    }
  }

  /**
   * Obtiene usuarios con beneficios pendientes y los que ya usaron sus beneficios
   */
  async getUserBenefitStatus(month = null, useCache = true) {
    try {
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      let filteredBenefits = benefitsData;
      // Si se especifica un mes, filtrar por ese mes
      if (month) {
        const targetMonth = month.toLowerCase();
        filteredBenefits = benefitsData.filter(benefit => 
          benefit.Mes_de_beneficio && 
          benefit.Mes_de_beneficio.toLowerCase() === targetMonth
        );
      }
      
      // Agrupar por usuario
      const userBenefits = filteredBenefits.reduce((acc, benefit) => {
        if (!benefit.Id_usuario || !benefit.Nombre) return acc;
        
        const userId = benefit.Id_usuario.toString();
        if (!acc[userId]) {
          acc[userId] = {
            id: userId,
            name: benefit.Nombre,
            benefits: []
          };
        }
        
        acc[userId].benefits.push({
          id: benefit.id,
          month: benefit.Mes_de_beneficio,
          selected: benefit.Beneficio_seleccionado || "No seleccionado",
          status: benefit.Estado || "Desconocido",
          date: benefit.Fecha_de_eleccion,
          category: benefit.Categoria,
          generation: benefit.Generacion,
          gender: benefit.H_M
        });
        
        return acc;
      }, {});
      
      // Categorizar usuarios
      const usersWithPendingBenefits = [];
      const usersWithUsedBenefits = [];
      const usersWithNotSelectedBenefits = [];
      
      Object.keys(userBenefits).forEach(userId => {
        const user = userBenefits[userId];
        // Clasificar usuario basado en su último beneficio
        const latestBenefit = [...user.benefits].sort((a, b) => {
          const dateA = this.parseDate(a.date) || new Date(0);
          const dateB = this.parseDate(b.date) || new Date(0);
          return dateB.getTime() - dateA.getTime();
        })[0];
        
        if (latestBenefit) {
          const status = latestBenefit.status.toLowerCase();
          if (status === 'pendiente') {
            usersWithPendingBenefits.push({
              ...user,
              latestBenefit
            });
          } else if (status === 'canjeado' || status === 'entregado') {
            usersWithUsedBenefits.push({
              ...user,
              latestBenefit
            });
          } else if (status === 'no seleccionó') {
            usersWithNotSelectedBenefits.push({
              ...user,
              latestBenefit
            });
          }
        }
      });
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Analizando estado de beneficios por usuario`, {
        totalUsers: Object.keys(userBenefits).length,
        usersWithPending: usersWithPendingBenefits.length,
        usersWithUsed: usersWithUsedBenefits.length,
        usersWithNotSelected: usersWithNotSelectedBenefits.length
      });
      
      return {
        totalUsers: Object.keys(userBenefits).length,
        usersWithPendingBenefits: usersWithPendingBenefits.sort((a, b) => a.name.localeCompare(b.name)),
        usersWithUsedBenefits: usersWithUsedBenefits.sort((a, b) => a.name.localeCompare(b.name)),
        usersWithNotSelectedBenefits: usersWithNotSelectedBenefits.sort((a, b) => a.name.localeCompare(b.name)),
        pendingCount: usersWithPendingBenefits.length,
        usedCount: usersWithUsedBenefits.length,
        notSelectedCount: usersWithNotSelectedBenefits.length
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al obtener estado de usuarios: ${error.message}`, { error });
      return { error: `Error al obtener estado de usuarios: ${error.message}` };
    }
  }

  /**
   * Obtiene el total de usuarios activos en un mes específico
   */
  async getActiveUsersInMonth(month = null, useCache = true) {
    try {
      const currentDate = new Date();
      let targetMonth = month;
      
      // Si no se especifica un mes, usar el mes actual
      if (!targetMonth) {
        const monthsInSpanish = {
          0: 'enero',
          1: 'febrero',
          2: 'marzo',
          3: 'abril',
          4: 'mayo',
          5: 'junio',
          6: 'julio',
          7: 'agosto',
          8: 'septiembre',
          9: 'octubre',
          10: 'noviembre',
          11: 'diciembre'
        };
        targetMonth = monthsInSpanish[currentDate.getMonth()];
      }
      
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      // Filtrar beneficios para el mes objetivo
      const monthBenefits = benefitsData.filter(benefit => 
        benefit.Mes_de_beneficio && 
        benefit.Mes_de_beneficio.toLowerCase() === targetMonth.toLowerCase()
      );
      
      // Extraer usuarios únicos
      const uniqueUsers = new Set(monthBenefits.map(benefit => benefit.Id_usuario).filter(id => id));
      
      // Obtener detalle de usuarios
      const activeUsers = [...uniqueUsers].map(userId => {
        const userBenefits = monthBenefits.filter(benefit => benefit.Id_usuario === userId);
        const latestBenefit = userBenefits.sort((a, b) => {
          const dateA = this.parseDate(a.Fecha_de_eleccion) || new Date(0);
          const dateB = this.parseDate(b.Fecha_de_eleccion) || new Date(0);
          return dateB.getTime() - dateA.getTime();
        })[0];
        
        return {
          id: userId,
          name: latestBenefit.Nombre,
          generation: latestBenefit.Generacion,
          gender: latestBenefit.H_M,
          latestBenefit: {
            selected: latestBenefit.Beneficio_seleccionado || "No seleccionado",
            status: latestBenefit.Estado || "Desconocido",
            date: latestBenefit.Fecha_de_eleccion,
            category: latestBenefit.Categoria
          }
        };
      });
      
      // Categorizar por género y generación
      const byGender = activeUsers.reduce((acc, user) => {
        const gender = user.gender === 'H' ? 'Hombres' : user.gender === 'M' ? 'Mujeres' : 'No especificado';
        if (!acc[gender]) acc[gender] = [];
        acc[gender].push(user);
        return acc;
      }, {});
      
      const byGeneration = activeUsers.reduce((acc, user) => {
        const generation = user.generation || 'No especificado';
        if (!acc[generation]) acc[generation] = [];
        acc[generation].push(user);
        return acc;
      }, {});
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando usuarios activos para ${targetMonth}`, {
        totalUsers: uniqueUsers.size,
        byGender: Object.keys(byGender).map(k => `${k}: ${byGender[k].length}`),
        byGeneration: Object.keys(byGeneration).map(k => `${k}: ${byGeneration[k].length}`)
      });
      
      return {
        month: targetMonth,
        totalActiveUsers: uniqueUsers.size,
        activeUsers: activeUsers.sort((a, b) => a.name.localeCompare(b.name)),
        byGender: Object.entries(byGender).map(([gender, users]) => ({
          gender,
          count: users.length,
          percentage: parseFloat(((users.length / uniqueUsers.size) * 100).toFixed(2))
        })),
        byGeneration: Object.entries(byGeneration).map(([generation, users]) => ({
          generation,
          count: users.length,
          percentage: parseFloat(((users.length / uniqueUsers.size) * 100).toFixed(2))
        }))
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al obtener usuarios activos: ${error.message}`, { error });
      return { error: `Error al obtener usuarios activos: ${error.message}` };
    }
  }

  /**
   * Calcula inversión y devolución para un mes específico
   */
  async getMonthlyInvestment(month = null, useCache = true) {
    try {
      const currentDate = new Date();
      let targetMonth = month;
      
      // Si no se especifica un mes, usar el mes actual
      if (!targetMonth) {
        const monthsInSpanish = {
          0: 'enero',
          1: 'febrero',
          2: 'marzo',
          3: 'abril',
          4: 'mayo',
          5: 'junio',
          6: 'julio',
          7: 'agosto',
          8: 'septiembre',
          9: 'octubre',
          10: 'noviembre',
          11: 'diciembre'
        };
        targetMonth = monthsInSpanish[currentDate.getMonth()];
      }
      
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      // Filtrar beneficios para el mes objetivo
      const monthBenefits = benefitsData.filter(benefit => 
        benefit.Mes_de_beneficio && 
        benefit.Mes_de_beneficio.toLowerCase() === targetMonth.toLowerCase()
      );
      
      // Calcular inversión total (sum of Inversion field)
      const totalInvestment = monthBenefits.reduce((sum, benefit) => {
        return sum + (benefit.Inversion || 0);
      }, 0);
      
      // Calcular devolución total (sum of Devolucion field)
      const totalRefund = monthBenefits.reduce((sum, benefit) => {
        return sum + (benefit.Devolucion || 0);
      }, 0);
      
      // Desglosar por categoría
      const investmentByCategory = monthBenefits.reduce((acc, benefit) => {
        const category = benefit.Categoria || 'No especificado';
        if (!acc[category]) {
          acc[category] = {
            investment: 0,
            count: 0
          };
        }
        
        acc[category].investment += (benefit.Inversion || 0);
        acc[category].count++;
        
        return acc;
      }, {});
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando inversión para ${targetMonth}`, {
        totalInvestment,
        totalRefund,
        categories: Object.keys(investmentByCategory).length
      });
      
      return {
        month: targetMonth,
        totalInvestment,
        totalRefund,
        netInvestment: totalInvestment - totalRefund,
        countBenefits: monthBenefits.length,
        investmentByCategory: Object.entries(investmentByCategory).map(([category, data]) => ({
          category,
          investment: data.investment,
          count: data.count,
          percentage: parseFloat(((data.investment / totalInvestment) * 100).toFixed(2))
        })).sort((a, b) => b.investment - a.investment)
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al calcular inversión: ${error.message}`, { error });
      return { error: `Error al calcular inversión: ${error.message}` };
    }
  }

  /**
   * Obtiene las top categorías de beneficios
   */
  async getTopCategories(useCache = true) {
    try {
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      // Contar beneficios por categoría
      const categoryCounts = benefitsData.reduce((acc, benefit) => {
        const category = benefit.Categoria || 'No especificado';
        if (!acc[category]) {
          acc[category] = {
            count: 0,
            redeemed: 0,
            investment: 0
          };
        }
        
        acc[category].count++;
        
        // Contar redimidos
        if (benefit.Estado && (benefit.Estado === 'Canjeado' || benefit.Estado === 'Entregado')) {
          acc[category].redeemed++;
        }
        
        // Sumar inversión
        acc[category].investment += (benefit.Inversion || 0);
        
        return acc;
      }, {});
      
      // Transformar a array y ordenar
      const topCategories = Object.entries(categoryCounts)
        .map(([category, data]) => ({
          category,
          count: data.count,
          redeemed: data.redeemed,
          investment: data.investment,
          redemptionRate: parseFloat(((data.redeemed / data.count) * 100).toFixed(2)),
          percentage: parseFloat(((data.count / benefitsData.length) * 100).toFixed(2))
        }))
        .sort((a, b) => b.count - a.count);
      
      // Analizar por mes
      const categoryByMonth = benefitsData.reduce((acc, benefit) => {
        const month = benefit.Mes_de_beneficio || 'No especificado';
        const category = benefit.Categoria || 'No especificado';
        
        if (!acc[month]) {
          acc[month] = {};
        }
        
        if (!acc[month][category]) {
          acc[month][category] = {
            count: 0,
            redeemed: 0,
            investment: 0
          };
        }
        
        acc[month][category].count++;
        
        // Contar redimidos
        if (benefit.Estado && (benefit.Estado === 'Canjeado' || benefit.Estado === 'Entregado')) {
          acc[month][category].redeemed++;
        }
        
        // Sumar inversión
        acc[month][category].investment += (benefit.Inversion || 0);
        
        return acc;
      }, {});
      
      // Encuentra la categoría más popular por mes
      const topCategoryByMonth = Object.entries(categoryByMonth).map(([month, categories]) => {
        const topCategory = Object.entries(categories)
          .map(([category, data]) => ({
            category,
            count: data.count,
            redeemed: data.redeemed,
            investment: data.investment
          }))
          .sort((a, b) => b.count - a.count)[0];
        
        return {
          month,
          topCategory: topCategory ? topCategory.category : 'N/A',
          count: topCategory ? topCategory.count : 0,
          percentage: topCategory ? 
            parseFloat(((topCategory.count / Object.values(categories).reduce((sum, cat) => sum + cat.count, 0)) * 100).toFixed(2)) : 0
        };
      }).sort((a, b) => {
        const monthOrder = {
          'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 
          'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8, 
          'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        const orderA = monthOrder[a.month.toLowerCase()] || 999;
        const orderB = monthOrder[b.month.toLowerCase()] || 999;
        return orderA - orderB;
      });
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Calculando top categorías`, {
        totalCategories: topCategories.length,
        topCategory: topCategories[0] ? topCategories[0].category : 'N/A'
      });
      
      // Analizar diciembre versus otros meses
      const decemberCategories = categoryByMonth['diciembre'] || {};
      const topDecemberCategories = Object.entries(decemberCategories)
        .map(([category, data]) => ({
          category,
          count: data.count,
          percentage: Object.values(decemberCategories).reduce((sum, cat) => sum + cat.count, 0) > 0 ?
            parseFloat(((data.count / Object.values(decemberCategories).reduce((sum, cat) => sum + cat.count, 0)) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => b.count - a.count);
      
      // Comparar con otros meses
      const otherMonthsCategories = {};
      Object.entries(categoryByMonth)
        .filter(([month]) => month.toLowerCase() !== 'diciembre')
        .forEach(([month, categories]) => {
          Object.entries(categories).forEach(([category, data]) => {
            if (!otherMonthsCategories[category]) {
              otherMonthsCategories[category] = {
                count: 0,
                months: 0
              };
            }
            otherMonthsCategories[category].count += data.count;
            otherMonthsCategories[category].months++;
          });
        });
      
      const topOtherMonthsCategories = Object.entries(otherMonthsCategories)
        .map(([category, data]) => ({
          category,
          count: data.count,
          averagePerMonth: parseFloat((data.count / data.months).toFixed(2)),
          percentage: Object.values(otherMonthsCategories).reduce((sum, cat) => sum + cat.count, 0) > 0 ?
            parseFloat(((data.count / Object.values(otherMonthsCategories).reduce((sum, cat) => sum + cat.count, 0)) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => b.count - a.count);
      
      return {
        topCategories: topCategories.slice(0, 5),
        allCategories: topCategories,
        totalCategories: topCategories.length,
        topCategoryByMonth,
        comparisonWithDecember: {
          topDecemberCategories: topDecemberCategories.slice(0, 3),
          topOtherMonthsCategories: topOtherMonthsCategories.slice(0, 3)
        }
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al obtener top categorías: ${error.message}`, { error });
      return { error: `Error al obtener top categorías: ${error.message}` };
    }
  }

  /**
   * Compara diciembre con el resto de meses
   */
  async compareDecemberWithOtherMonths(useCache = true) {
    try {
      // Obtener los datos desde Firebase o el caché
      const benefitsData = await this.fetchAllBenefitsData(useCache);
      if (!benefitsData || benefitsData.length === 0) {
        return { error: "No se encontraron datos de beneficios" };
      }
      
      // Agrupar beneficios por mes
      const benefitsByMonth = benefitsData.reduce((acc, benefit) => {
        if (!benefit.Mes_de_beneficio || benefit.Mes_de_beneficio === 'N/A') return acc;
        
        const month = benefit.Mes_de_beneficio.toLowerCase();
        if (!acc[month]) {
          acc[month] = {
            total: 0,
            redeemed: 0,
            pending: 0,
            notSelected: 0,
            investment: 0,
            refund: 0,
            categories: {},
            providers: {},
            users: new Set()
          };
        }
        
        acc[month].total++;
        acc[month].investment += (benefit.Inversion || 0);
        acc[month].refund += (benefit.Devolucion || 0);
        
        // Contar por estado
        if (benefit.Estado) {
          const status = benefit.Estado.toLowerCase();
          if (status === 'canjeado' || status === 'entregado') {
            acc[month].redeemed++;
          } else if (status === 'pendiente') {
            acc[month].pending++;
          } else if (status === 'no seleccionó') {
            acc[month].notSelected++;
          }
        }
        
        // Contar categorías
        if (benefit.Categoria) {
          const category = benefit.Categoria;
          if (!acc[month].categories[category]) {
            acc[month].categories[category] = 0;
          }
          acc[month].categories[category]++;
        }
        
        // Contar proveedores
        if (benefit.Proveedor_beneficio) {
          const provider = benefit.Proveedor_beneficio;
          if (!acc[month].providers[provider]) {
            acc[month].providers[provider] = 0;
          }
          acc[month].providers[provider]++;
        }
        
        // Contar usuarios únicos
        if (benefit.Id_usuario) {
          acc[month].users.add(benefit.Id_usuario);
        }
        
        return acc;
      }, {});
      
      // Procesar datos de diciembre
      const decemberData = benefitsByMonth['diciembre'] || {
        total: 0,
        redeemed: 0,
        pending: 0,
        notSelected: 0,
        investment: 0,
        refund: 0,
        categories: {},
        providers: {},
        users: new Set()
      };
      
      // Calcular datos para otros meses
      const otherMonths = Object.keys(benefitsByMonth).filter(month => month !== 'diciembre');
      const otherMonthsData = {
        months: otherMonths,
        total: 0,
        redeemed: 0,
        pending: 0,
        notSelected: 0,
        investment: 0,
        refund: 0,
        categories: {},
        providers: {},
        users: new Set(),
        avgPerMonth: {
          total: 0,
          redeemed: 0,
          pending: 0,
          notSelected: 0,
          investment: 0,
          refund: 0
        }
      };
      
      otherMonths.forEach(month => {
        const monthData = benefitsByMonth[month];
        otherMonthsData.total += monthData.total;
        otherMonthsData.redeemed += monthData.redeemed;
        otherMonthsData.pending += monthData.pending;
        otherMonthsData.notSelected += monthData.notSelected;
        otherMonthsData.investment += monthData.investment;
        otherMonthsData.refund += monthData.refund;
        
        // Agregar categorías y proveedores
        Object.entries(monthData.categories).forEach(([category, count]) => {
          if (!otherMonthsData.categories[category]) {
            otherMonthsData.categories[category] = 0;
          }
          otherMonthsData.categories[category] += count;
        });
        
        Object.entries(monthData.providers).forEach(([provider, count]) => {
          if (!otherMonthsData.providers[provider]) {
            otherMonthsData.providers[provider] = 0;
          }
          otherMonthsData.providers[provider] += count;
        });
        
        // Agregar usuarios únicos
        monthData.users.forEach(user => otherMonthsData.users.add(user));
      });
      
      // Calcular promedios para otros meses
      if (otherMonths.length > 0) {
        otherMonthsData.avgPerMonth.total = parseFloat((otherMonthsData.total / otherMonths.length).toFixed(2));
        otherMonthsData.avgPerMonth.redeemed = parseFloat((otherMonthsData.redeemed / otherMonths.length).toFixed(2));
        otherMonthsData.avgPerMonth.pending = parseFloat((otherMonthsData.pending / otherMonths.length).toFixed(2));
        otherMonthsData.avgPerMonth.notSelected = parseFloat((otherMonthsData.notSelected / otherMonths.length).toFixed(2));
        otherMonthsData.avgPerMonth.investment = parseFloat((otherMonthsData.investment / otherMonths.length).toFixed(2));
        otherMonthsData.avgPerMonth.refund = parseFloat((otherMonthsData.refund / otherMonths.length).toFixed(2));
      }
      
      // Encontrar top categorías
      const decemberTopCategories = Object.entries(decemberData.categories || {})
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
        .slice(0, 3);
      
      const otherMonthsTopCategories = Object.entries(otherMonthsData.categories || {})
        .map(([category, count]) => ({ 
          category, 
          count, 
          avgPerMonth: parseFloat(((Number(count) || 0) / otherMonths.length).toFixed(2))
        }))
        .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
        .slice(0, 3);
      
      // Calcular diferencias
      const differences = {
        total: parseFloat((decemberData.total - otherMonthsData.avgPerMonth.total).toFixed(2)),
        redeemed: parseFloat((decemberData.redeemed - otherMonthsData.avgPerMonth.redeemed).toFixed(2)),
        pending: parseFloat((decemberData.pending - otherMonthsData.avgPerMonth.pending).toFixed(2)),
        notSelected: parseFloat((decemberData.notSelected - otherMonthsData.avgPerMonth.notSelected).toFixed(2)),
        investment: parseFloat((decemberData.investment - otherMonthsData.avgPerMonth.investment).toFixed(2)),
        refund: parseFloat((decemberData.refund - otherMonthsData.avgPerMonth.refund).toFixed(2)),
        users: decemberData.users.size - (otherMonthsData.users.size / otherMonths.length)
      };
      
      // Calcular porcentajes de diferencia
      const percentageDiff = {
        total: otherMonthsData.avgPerMonth.total > 0 ? 
          parseFloat(((differences.total / otherMonthsData.avgPerMonth.total) * 100).toFixed(2)) : 0,
        redeemed: otherMonthsData.avgPerMonth.redeemed > 0 ? 
          parseFloat(((differences.redeemed / otherMonthsData.avgPerMonth.redeemed) * 100).toFixed(2)) : 0,
        pending: otherMonthsData.avgPerMonth.pending > 0 ? 
          parseFloat(((differences.pending / otherMonthsData.avgPerMonth.pending) * 100).toFixed(2)) : 0,
        notSelected: otherMonthsData.avgPerMonth.notSelected > 0 ? 
          parseFloat(((differences.notSelected / otherMonthsData.avgPerMonth.notSelected) * 100).toFixed(2)) : 0,
        investment: otherMonthsData.avgPerMonth.investment > 0 ? 
          parseFloat(((differences.investment / otherMonthsData.avgPerMonth.investment) * 100).toFixed(2)) : 0,
        refund: otherMonthsData.avgPerMonth.refund > 0 ? 
          parseFloat(((differences.refund / otherMonthsData.avgPerMonth.refund) * 100).toFixed(2)) : 0,
        users: (otherMonthsData.users.size / otherMonths.length) > 0 ? 
          parseFloat(((differences.users / (otherMonthsData.users.size / otherMonths.length)) * 100).toFixed(2)) : 0
      };
      
      logger.debug(LOG_CATEGORY.ANALYTICS, `Comparando diciembre con otros meses`, {
        decemberTotal: decemberData.total,
        otherMonthsAvg: otherMonthsData.avgPerMonth.total,
        difference: differences.total,
        percentageDiff: percentageDiff.total
      });
      
      return {
        december: {
          total: decemberData.total,
          redeemed: decemberData.redeemed,
          pending: decemberData.pending,
          notSelected: decemberData.notSelected,
          investment: decemberData.investment,
          refund: decemberData.refund,
          uniqueUsers: decemberData.users.size,
          redemptionRate: decemberData.total > 0 ? 
            parseFloat(((decemberData.redeemed / decemberData.total) * 100).toFixed(2)) : 0,
          topCategories: decemberTopCategories
        },
        otherMonths: {
          months: otherMonths,
          avgPerMonth: otherMonthsData.avgPerMonth,
          uniqueUsersAvg: parseFloat((otherMonthsData.users.size / otherMonths.length).toFixed(2)),
          redemptionRate: otherMonthsData.total > 0 ? 
            parseFloat(((otherMonthsData.redeemed / otherMonthsData.total) * 100).toFixed(2)) : 0,
          topCategories: otherMonthsTopCategories
        },
        differences,
        percentageDiff,
        conclusion: {
          isHigher: differences.total > 0,
          redemptionRateDiff: parseFloat(((decemberData.total > 0 ? (decemberData.redeemed / decemberData.total) * 100 : 0) - 
            (otherMonthsData.total > 0 ? (otherMonthsData.redeemed / otherMonthsData.total) * 100 : 0)).toFixed(2))
        }
      };
    } catch (error) {
      logger.error(LOG_CATEGORY.ANALYTICS, `Error al comparar diciembre: ${error.message}`, { error });
      return { error: `Error al comparar diciembre: ${error.message}` };
    }
  }

  /**
   * Obtener todos los datos de beneficios desde Firebase o caché
   */
  private async fetchAllBenefitsData(useCache = true) {
    const now = Date.now();
    
    // Si hay datos en caché y no han expirado, usarlos
    if (useCache && this.cachedData && (now - this.lastDataFetch) < this.cacheTTL) {
      logger.debug(LOG_CATEGORY.QUERY, `Usando datos en caché (edad: ${(now - this.lastDataFetch) / 1000}s)`);
      return this.cachedData;
    }
    
    try {
      logger.info(LOG_CATEGORY.QUERY, `Obteniendo datos frescos de Firebase`);
      
      // Intentar varias rutas posibles
      const possiblePaths = [
        'firestore',
        'realtime/firestore'
      ];
      
      let data = null;
      
      for (const path of possiblePaths) {
        logger.debug(LOG_CATEGORY.QUERY, `Intentando obtener datos de: ${path}`);
        const dbRef = ref(this.rtdb, path);
        const snapshot = await get(dbRef);
        
        if (snapshot.exists()) {
          data = snapshot.val();
          logger.info(LOG_CATEGORY.QUERY, `Datos encontrados en: ${path}`);
          break;
        }
      }
      
      if (!data) {
        throw new Error("No se encontraron datos en ninguna ruta");
      }
      
      // Si los datos son un objeto, convertir a array
      if (!Array.isArray(data)) {
        data = Object.values(data);
      }
      
      // Actualizar caché
      this.cachedData = data;
      this.lastDataFetch = now;
      
      logger.info(LOG_CATEGORY.QUERY, `Datos obtenidos correctamente: ${data.length} registros`);
      return data;
    } catch (error) {
      logger.error(LOG_CATEGORY.QUERY, `Error al obtener datos: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Parsea una fecha en formato DD/MM/YYYY
   */
  private parseDate(dateStr) {
    if (!dateStr || dateStr === 'N/A') return null;
    
    // Intentar parsear fecha en formato DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Meses en JS son 0-indexed
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    
    return null;
  }

  /**
   * Procesa comandos de Firebase en lenguaje natural con registro mejorado
   * @param commands Array de comandos para ejecutar
   * @returns Resultados de la ejecución de comandos
   */
  async executeCommands(commands) {
    if (!this.isConnected) {
      logger.warn(LOG_CATEGORY.QUERY, 'Intento de ejecutar comandos pero Firebase no está conectado', { commands });
      return [{
        command: "firebase:connection",
        error: "Firebase no está conectado"
      }];
    }
    
    if (!commands || commands.length === 0) {
      logger.debug(LOG_CATEGORY.QUERY, 'No hay comandos para ejecutar');
      return [];
    }
    
    logger.info(LOG_CATEGORY.QUERY, `Ejecutando ${commands.length} comandos de Firebase`, { 
      commandCount: commands.length,
      commandsList: commands
    });
    
    const results = [];
    const startTime = Date.now();
    
    for (const command of commands) {
      try {
        this.lastOperationTimestamp = Date.now();
        this.operationCount++;
        
        if (!command.startsWith('firebase:')) {
          logger.debug(LOG_CATEGORY.QUERY, 'Omitiendo comando que no es de Firebase', { command });
          continue;
        }
        
        logger.debug(LOG_CATEGORY.QUERY, `Procesando comando: ${command}`);
        const commandStartTime = Date.now();
        
        const parts = command.split(':');
        const operation = parts[1]; // get, update, set, query, analytics
        
        // Procesamos los nuevos comandos de analítica
        if (operation === 'analytics') {
          const analysisType = parts[2]; // month-progress, redemption-rate, etc.
          const analysisParams = parts[3] ? this.parseQueryParams(parts[3]) : [];
          
          switch (analysisType) {
            case 'month-progress': {
              const result = await this.getMonthProgress();
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'redemption-rate': {
              // Parámetros opcionales: date, month
              let date = new Date();
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'date' && param.operator === '==') {
                  // Convertir string a fecha
                  if (typeof param.value === 'string') {
                    date = this.parseDate(param.value) || date;
                  }
                } else if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getRedemptionRate(date, useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'historical-rate': {
              // Parámetro opcional: cache
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getHistoricalRedemptionRate(useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'benefit-status': {
              // Parámetros opcionales: month, cache
              let month = null;
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'month' && param.operator === '==') {
                  month = param.value;
                } else if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getUserBenefitStatus(month, useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'active-users': {
              // Parámetros opcionales: month, cache
              let month = null;
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'month' && param.operator === '==') {
                  month = param.value;
                } else if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getActiveUsersInMonth(month, useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'investment': {
              // Parámetros opcionales: month, cache
              let month = null;
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'month' && param.operator === '==') {
                  month = param.value;
                } else if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getMonthlyInvestment(month, useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'top-categories': {
              // Parámetro opcional: cache
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.getTopCategories(useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            case 'compare-december': {
              // Parámetro opcional: cache
              let useCache = true;
              
              analysisParams.forEach(param => {
                if (param.field === 'cache' && param.operator === '==') {
                  useCache = param.value === 'true' || param.value === true;
                }
              });
              
              const result = await this.compareDecemberWithOtherMonths(useCache);
              results.push({
                command,
                result
              });
              break;
            }
            
            default: {
              logger.warn(LOG_CATEGORY.ANALYTICS, `Tipo de análisis desconocido: ${analysisType}`);
              results.push({
                command,
                error: `Tipo de análisis desconocido: ${analysisType}`
              });
            }
          }
        } else {
          const path = parts[2]; // colección/documentId
          
          // Procesamos los comandos para RTDB
          switch (operation) {
            case 'get': {
              // Obtener datos de RTDB
              const dbRef = ref(this.rtdb, path);
              logger.debug(LOG_CATEGORY.QUERY, `Obteniendo datos de RTDB en ruta: ${path}`);
              
              const snapshot = await get(dbRef);
              let data;
              
              if (snapshot.exists()) {
                data = snapshot.val();
                logger.debug(LOG_CATEGORY.QUERY, `Datos obtenidos correctamente de RTDB`, {
                  pathQueried: path,
                  dataLength: typeof data === 'object' ? Object.keys(data).length : 1
                });
              } else {
                logger.warn(LOG_CATEGORY.QUERY, `No se encontraron datos en la ruta: ${path}`);
                data = null;
              }
              
              results.push({
                command,
                result: data
              });
              break;
            }
            
            case 'query': {
              const originalPath = path;
              const basePath = `realtime/${path}`;
              
              logger.info(LOG_CATEGORY.QUERY, `Consultando datos en ruta: ${basePath}`);
              
              // Parámetros de consulta (ejemplo: "Mes_de_beneficio=diciembre")
              const queryParams = parts[3] ? this.parseQueryParams(parts[3]) : [];
              logger.debug(LOG_CATEGORY.QUERY, `Parámetros de consulta parseados:`, { queryParams });
              
              try {
                // Primero probamos con el camino directo
                const dbRef = ref(this.rtdb, basePath);
                const resultData = [];
                
                // Obtener todos los datos para filtrar manualmente (evitar problemas de índice)
                const snapshot = await get(dbRef);
                
                if (snapshot.exists()) {
                  const data = snapshot.val();
                  
                  // Filtrar manualmente según los criterios (siempre)
                  Object.keys(data).forEach(key => {
                    const item = data[key];
                    let include = true;
                    
                    // Aplicar todos los filtros de queryParams
                    for (const param of queryParams) {
                      const fieldValue = item[param.field];
                      
                      // Solo incluir si el campo existe
                      if (fieldValue === undefined) {
                        include = false;
                        break;
                      }
                      
                      // Comparar según el operador
                      switch (param.operator) {
                        case '==': {
                          // Comparación case-insensitive para strings
                          if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                            if (fieldValue.toLowerCase() !== param.value.toLowerCase()) {
                              include = false;
                            }
                          } else if (fieldValue !== param.value) {
                            include = false;
                          }
                          break;
                        }
                        case '!=': {
                          if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                            if (fieldValue.toLowerCase() === param.value.toLowerCase()) {
                              include = false;
                            }
                          } else if (fieldValue === param.value) {
                            include = false;
                          }
                          break;
                        }
                        case '<': {
                          if (fieldValue >= param.value) {
                            include = false;
                          }
                          break;
                        }
                        case '<=': {
                          if (fieldValue > param.value) {
                            include = false;
                          }
                          break;
                        }
                        case '>': {
                          if (fieldValue <= param.value) {
                            include = false;
                          }
                          break;
                        }
                        case '>=': {
                          if (fieldValue < param.value) {
                            include = false;
                          }
                          break;
                        }
                      }
                      
                      if (!include) break;
                    }
                    
                    if (include) {
                      resultData.push({
                        ...item,
                        id: key
                      });
                    }
                  });
                  
                  logger.info(LOG_CATEGORY.QUERY, `Consulta en ruta ${basePath} devolvió ${resultData.length} resultados`);
                  
                  results.push({
                    command,
                    result: resultData
                  });
                } else {
                  // Si no hay datos en el camino con prefijo, intentamos el camino directo
                  logger.warn(LOG_CATEGORY.QUERY, `No se encontraron datos en ruta ${basePath}, intentando con ${originalPath}`);
                  
                  const directDbRef = ref(this.rtdb, originalPath);
                  const directSnapshot = await get(directDbRef);
                  
                  if (directSnapshot.exists()) {
                    const data = directSnapshot.val();
                    
                    // Filtrar manualmente según los criterios (siempre)
                    Object.keys(data).forEach(key => {
                      const item = data[key];
                      let include = true;
                      
                      // Aplicar todos los filtros de queryParams
                      for (const param of queryParams) {
                        const fieldValue = item[param.field];
                        
                        // Solo incluir si el campo existe
                        if (fieldValue === undefined) {
                          include = false;
                          break;
                        }
                        
                        // Comparar según el operador (código simplificado igual que antes)
                        switch (param.operator) {
                          case '==': {
                            if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                              if (fieldValue.toLowerCase() !== param.value.toLowerCase()) {
                                include = false;
                              }
                            } else if (fieldValue !== param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '!=': {
                            if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                              if (fieldValue.toLowerCase() === param.value.toLowerCase()) {
                                include = false;
                              }
                            } else if (fieldValue === param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '<': {
                            if (fieldValue >= param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '<=': {
                            if (fieldValue > param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '>': {
                            if (fieldValue <= param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '>=': {
                            if (fieldValue < param.value) {
                              include = false;
                            }
                            break;
                          }
                        }
                        
                        if (!include) break;
                      }
                      
                      if (include) {
                        resultData.push({
                          ...item,
                          id: key
                        });
                      }
                    });
                    
                    logger.info(LOG_CATEGORY.QUERY, `Consulta en ruta ${originalPath} devolvió ${resultData.length} resultados`);
                    
                    results.push({
                      command,
                      result: resultData
                    });
                  } else {
                    // Probar con la ruta "firestore"
                    logger.warn(LOG_CATEGORY.QUERY, `No se encontraron datos en ruta ${originalPath}, intentando con "firestore"`);
                    
                    const firestoreRef = ref(this.rtdb, "firestore");
                    const firestoreSnapshot = await get(firestoreRef);
                    
                    if (firestoreSnapshot.exists()) {
                      const data = firestoreSnapshot.val();
                      
                      // Filtrar manualmente
                      Object.keys(data).forEach(key => {
                        const item = data[key];
                        let include = true;
                        
                        for (const param of queryParams) {
                          const fieldValue = item[param.field];
                          
                          if (fieldValue === undefined) {
                            include = false;
                            break;
                          }
                          
                          switch (param.operator) {
                            case '==': {
                              if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                                if (fieldValue.toLowerCase() !== param.value.toLowerCase()) {
                                  include = false;
                                }
                              } else if (fieldValue !== param.value) {
                                include = false;
                              }
                              break;
                            }
                            case '!=': {
                              if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                                if (fieldValue.toLowerCase() === param.value.toLowerCase()) {
                                  include = false;
                                }
                              } else if (fieldValue === param.value) {
                                include = false;
                              }
                              break;
                            }
                            case '<': {
                              if (fieldValue >= param.value) {
                                include = false;
                              }
                              break;
                            }
                            case '<=': {
                              if (fieldValue > param.value) {
                                include = false;
                              }
                              break;
                            }
                            case '>': {
                              if (fieldValue <= param.value) {
                                include = false;
                              }
                              break;
                            }
                            case '>=': {
                              if (fieldValue < param.value) {
                                include = false;
                              }
                              break;
                            }
                          }
                          
                          if (!include) break;
                        }
                        
                        if (include) {
                          resultData.push({
                            ...item,
                            id: key
                          });
                        }
                      });
                      
                      logger.info(LOG_CATEGORY.QUERY, `Consulta en ruta "firestore" devolvió ${resultData.length} resultados`);
                      
                      results.push({
                        command,
                        result: resultData
                      });
                    } else {
                      logger.warn(LOG_CATEGORY.QUERY, `No se encontraron datos en ninguna ruta probada`);
                      results.push({
                        command,
                        result: []
                      });
                    }
                  }
                }
              } catch (error) {
                logger.error(LOG_CATEGORY.QUERY, `Error en consulta: ${error.message}`, { error });
                results.push({
                  command,
                  error: `Error al consultar datos: ${error.message}`
                });
              }
              break;
            }
            
            case 'count': {
              // Consulta para contar registros
              const basePath = path;
              
              // Parámetros de consulta
              const queryParams = parts[3] ? this.parseQueryParams(parts[3]) : [];
              logger.debug(LOG_CATEGORY.QUERY, `Parámetros para count parseados:`, { queryParams });
              
              try {
                // Intentamos varias rutas, empezando por realtime
                const possiblePaths = [
                  `realtime/${basePath}`,
                  basePath,
                  'firestore'
                ];
                
                const filteredItems = [];
                let foundData = false;
                
                // Intentar cada ruta hasta encontrar datos
                for (const currentPath of possiblePaths) {
                  logger.debug(LOG_CATEGORY.QUERY, `Intentando contar en ruta: ${currentPath}`);
                  
                  const dbRef = ref(this.rtdb, currentPath);
                  const snapshot = await get(dbRef);
                  
                  if (snapshot.exists()) {
                    const data = snapshot.val();
                    logger.info(LOG_CATEGORY.QUERY, `Encontrados datos en ruta: ${currentPath}`);
                    
                    // Filtrar manualmente según los criterios
                    Object.keys(data).forEach(key => {
                      const item = data[key];
                      let include = true;
                      
                      // Aplicar todos los filtros de queryParams
                      for (const param of queryParams) {
                        const fieldValue = item[param.field];
                        
                        // Comparaciones case-insensitive para strings
                        if (fieldValue === undefined) {
                          include = false;
                          break;
                        }
                        
                        // Aplicar operadores de comparación
                        switch (param.operator) {
                          case '==': {
                            if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                              if (fieldValue.toLowerCase() !== param.value.toLowerCase()) {
                                include = false;
                              }
                            } else if (fieldValue !== param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '!=': {
                            if (typeof fieldValue === 'string' && typeof param.value === 'string') {
                              if (fieldValue.toLowerCase() === param.value.toLowerCase()) {
                                include = false;
                              }
                            } else if (fieldValue === param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '<': {
                            if (fieldValue >= param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '<=': {
                            if (fieldValue > param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '>': {
                            if (fieldValue <= param.value) {
                              include = false;
                            }
                            break;
                          }
                          case '>=': {
                            if (fieldValue < param.value) {
                              include = false;
                            }
                            break;
                          }
                        }
                        
                        if (!include) break;
                      }
                      
                      if (include) {
                        filteredItems.push(item);
                      }
                    });
                    
                    // Devolver el conteo
                    logger.info(LOG_CATEGORY.QUERY, `Count en ${currentPath} con filtros devolvió ${filteredItems.length} resultados`);
                    
                    results.push({
                      command,
                      result: { count: filteredItems.length }
                    });
                    
                    foundData = true;
                    break; // Salimos del bucle si encontramos datos
                  }
                }
                
                if (!foundData) {
                  logger.warn(LOG_CATEGORY.QUERY, `No se encontraron datos en ninguna ruta para count`);
                  results.push({
                    command,
                    result: { count: 0 }
                  });
                }
              } catch (error) {
                logger.error(LOG_CATEGORY.QUERY, `Error en count: ${error.message}`, { error });
                results.push({
                  command,
                  error: `Error al contar datos: ${error.message}`
                });
              }
              break;
            }
            
            case 'set': {
              // Implementación para set
              logger.debug(LOG_CATEGORY.QUERY, `Operación set no implementada completamente`);
              results.push({
                command,
                error: "Operación set no implementada completamente"
              });
              break;
            }
            
            case 'update': {
              // Implementación para update
              logger.debug(LOG_CATEGORY.QUERY, `Operación update no implementada completamente`);
              results.push({
                command,
                error: "Operación update no implementada completamente"
              });
              break;
            }
            
            default: {
              logger.warn(LOG_CATEGORY.QUERY, `Operación desconocida: ${operation}`);
              results.push({
                command,
                error: `Operación desconocida: ${operation}`
              });
            }
          }
        }
        
        // Registrar tiempo de ejecución del comando
        const commandTime = Date.now() - commandStartTime;
        this.queryTimes.push(commandTime);
        logger.debug(LOG_CATEGORY.QUERY, `Comando ejecutado en ${commandTime}ms`, { command });
        
      } catch (error) {
        logger.error(LOG_CATEGORY.QUERY, `Error ejecutando comando: ${command}`, { 
          error: error.message,
          stack: error.stack
        });
        
        results.push({
          command,
          error: error.message || 'Error desconocido'
        });
      }
    }
    
    const totalTime = Date.now() - startTime;
    logger.info(LOG_CATEGORY.QUERY, `Todos los comandos ejecutados en ${totalTime}ms`, { 
      commandCount: commands.length,
      resultsCount: results.length,
      totalExecutionTime: totalTime
    });
    
    return results;
  }

  /**
   * Formatea los resultados para presentarlos al usuario
   */
  formatResultsForUser(commandResults, queryContext = "") {
    try {
      if (!commandResults || commandResults.length === 0) {
        return "No hay resultados disponibles.";
      }
      
      // Formatear según el tipo de resultado
      const firstResult = commandResults[0];
      
      // Si es un error, mostrar mensaje de error
      if (firstResult.error) {
        return `Error: ${firstResult.error}`;
      }
      
      // Si el comando es de análisis, formatear el resultado específicamente
      if (firstResult.command && firstResult.command.includes(':analytics:')) {
        const analysisType = firstResult.command.split(':')[2];
        
        switch (analysisType) {
          case 'month-progress': {
            const data = firstResult.result;
            return `Progreso del mes ${data.month}: ${data.progress}% (día ${data.currentDay} de ${data.lastDay})`;
          }
          
          case 'redemption-rate': {
            const data = firstResult.result;
            return `Tasa de canje para ${data.date} (${data.month}): ${data.redemptionRate}%\n` +
                  `Total de beneficios: ${data.totalBenefits}\n` +
                  `Beneficios canjeados: ${data.totalRedeemed}\n` +
                  `Canjeados este día: ${data.redeemedOnDate} (${data.dailyRate}%)`;
          }
          
          case 'historical-rate': {
            const data = firstResult.result;
            let output = `Tasa de canje histórica: ${data.globalRate}%\n` +
                         `Total de beneficios: ${data.totalBenefits}\n` +
                         `Total canjeados: ${data.totalRedeemed}\n\n` +
                         `Detalle por mes:\n`;
            
            data.monthlyRates.forEach(month => {
              output += `- ${month.month}: ${month.redemptionRate}% (${month.redeemed}/${month.total})\n`;
            });
            
            if (data.comparisonWithDecember) {
              const comp = data.comparisonWithDecember;
              output += `\nComparación de diciembre con otros meses:\n` +
                       `- Tasa diciembre: ${comp.decemberRate}%\n` +
                       `- Tasa otros meses: ${comp.otherMonthsRate}%\n` +
                       `- Diferencia: ${comp.difference > 0 ? '+' : ''}${comp.difference}% (${comp.isHigher ? 'mayor' : 'menor'})\n`;
            }
            
            return output;
          }
          
          case 'benefit-status': {
            const data = firstResult.result;
            return `Estado de beneficios:\n` +
                  `Total de usuarios: ${data.totalUsers}\n` +
                  `Usuarios con beneficios pendientes: ${data.pendingCount}\n` +
                  `Usuarios con beneficios usados: ${data.usedCount}\n` +
                  `Usuarios sin selección: ${data.notSelectedCount}\n\n` +
                  `Pendientes: ${data.usersWithPendingBenefits.map(u => u.name).join(', ')}\n\n` +
                  `Sin seleccionar: ${data.usersWithNotSelectedBenefits.map(u => u.name).join(', ')}`;
          }
          
          case 'active-users': {
            const data = firstResult.result;
            let output = `Usuarios activos en ${data.month}: ${data.totalActiveUsers}\n\n`;
            
            output += `Por género:\n`;
            data.byGender.forEach(g => {
              output += `- ${g.gender}: ${g.count} (${g.percentage}%)\n`;
            });
            
            output += `\nPor generación:\n`;
            data.byGeneration.forEach(g => {
              output += `- ${g.generation}: ${g.count} (${g.percentage}%)\n`;
            });
            
            return output;
          }
          
          case 'investment': {
            const data = firstResult.result;
            let output = `Inversión en ${data.month}:\n` +
                         `Total invertido: $${data.totalInvestment}\n` +
                         `Total devuelto: $${data.totalRefund}\n` +
                         `Inversión neta: $${data.netInvestment}\n` +
                         `Beneficios: ${data.countBenefits}\n\n` +
                         `Por categoría:\n`;
            
            data.investmentByCategory.forEach(cat => {
              output += `- ${cat.category}: $${cat.investment} (${cat.percentage}%) - ${cat.count} beneficios\n`;
            });
            
            return output;
          }
          
          case 'top-categories': {
            const data = firstResult.result;
            let output = `Top 5 categorías:\n`;
            
            data.topCategories.forEach((cat, index) => {
              output += `${index+1}. ${cat.category}: ${cat.count} (${cat.percentage}%) - Tasa de canje: ${cat.redemptionRate}%\n`;
            });
            
            output += `\nTop categoría por mes:\n`;
            data.topCategoryByMonth.forEach(month => {
              output += `- ${month.month}: ${month.topCategory} (${month.count} beneficios - ${month.percentage}%)\n`;
            });
            
            if (data.comparisonWithDecember && data.comparisonWithDecember.topDecemberCategories.length > 0) {
              output += `\nComparación diciembre vs otros meses:\n`;
              output += `Diciembre:\n`;
              data.comparisonWithDecember.topDecemberCategories.forEach((cat, index) => {
                output += `${index+1}. ${cat.category}: ${cat.count} (${cat.percentage}%)\n`;
              });
              
              output += `\nOtros meses (promedio):\n`;
              data.comparisonWithDecember.topOtherMonthsCategories.forEach((cat, index) => {
                output += `${index+1}. ${cat.category}: ${cat.averagePerMonth} por mes (${cat.percentage}%)\n`;
              });
            }
            
            return output;
          }
          
          case 'compare-december': {
            const data = firstResult.result;
            let output = `Comparación de diciembre con otros meses:\n\n`;
            
            output += `Diciembre:\n` +
                     `- Total de beneficios: ${data.december.total}\n` +
                     `- Canjeados: ${data.december.redeemed} (${data.december.redemptionRate}%)\n` +
                     `- Pendientes: ${data.december.pending}\n` +
                     `- No seleccionados: ${data.december.notSelected}\n` +
                     `- Inversión: $${data.december.investment}\n` +
                     `- Usuarios únicos: ${data.december.uniqueUsers}\n`;
            
            output += `\nPromedios otros meses:\n` +
                     `- Total de beneficios: ${data.otherMonths.avgPerMonth.total}\n` +
                     `- Canjeados: ${data.otherMonths.avgPerMonth.redeemed} (${data.otherMonths.redemptionRate}%)\n` +
                     `- Pendientes: ${data.otherMonths.avgPerMonth.pending}\n` +
                     `- No seleccionados: ${data.otherMonths.avgPerMonth.notSelected}\n` +
                     `- Inversión: $${data.otherMonths.avgPerMonth.investment}\n` +
                     `- Usuarios únicos: ${data.otherMonths.uniqueUsersAvg}\n`;
            
            output += `\nDiferencias (diciembre vs promedio):\n` +
                     `- Total de beneficios: ${data.differences.total > 0 ? '+' : ''}${data.differences.total} (${data.percentageDiff.total > 0 ? '+' : ''}${data.percentageDiff.total}%)\n` +
                     `- Canjeados: ${data.differences.redeemed > 0 ? '+' : ''}${data.differences.redeemed} (${data.percentageDiff.redeemed > 0 ? '+' : ''}${data.percentageDiff.redeemed}%)\n` +
                     `- Tasa de canje: ${data.conclusion.redemptionRateDiff > 0 ? '+' : ''}${data.conclusion.redemptionRateDiff}%\n` +
                     `- Inversión: $${data.differences.investment > 0 ? '+' : ''}${data.differences.investment} (${data.percentageDiff.investment > 0 ? '+' : ''}${data.percentageDiff.investment}%)\n`;
            
            output += `\nTop categorías diciembre:\n`;
            data.december.topCategories.forEach((cat, index) => {
              output += `${index+1}. ${cat.category}: ${cat.count}\n`;
            });
            
            return output;
          }
          
          default: {
            return `Resultado del análisis ${analysisType}: ${JSON.stringify(firstResult.result, null, 2)}`;
          }
        }
      }
      
      // Si los resultados son datos de beneficios, resumir
      if (Array.isArray(firstResult.result) && firstResult.result.length > 0 && firstResult.result[0].Beneficio_seleccionado) {
        const count = firstResult.result.length;
        
        // Contar por categoría
        const categories = {};
        firstResult.result.forEach(item => {
          const category = item.Categoria || 'Sin categoría';
          if (!categories[category]) {
            categories[category] = 0;
          }
          categories[category]++;
        });
        
        // Contar por mes
        const months = {};
        firstResult.result.forEach(item => {
          const month = item.Mes_de_beneficio || 'Sin mes';
          if (!months[month]) {
            months[month] = 0;
          }
          months[month]++;
        });
        
        // Contar por estado
        const states = {};
        firstResult.result.forEach(item => {
          const state = item.Estado || 'Sin estado';
          if (!states[state]) {
            states[state] = 0;
          }
          states[state]++;
        });
        
        // Formatear información
        let output = `Se encontraron ${count} registros.\n\n`;
        
        output += `Distribución por categoría:\n`;
        Object.entries(categories).forEach(([category, count]) => {
          output += `- ${category}: ${count}\n`;
        });
        
        output += `\nDistribución por mes:\n`;
        Object.entries(months).forEach(([month, count]) => {
          output += `- ${month}: ${count}\n`;
        });
        
        if (Object.keys(states).length > 0) {
          output += `\nDistribución por estado:\n`;
          Object.entries(states).forEach(([state, count]) => {
            output += `- ${state}: ${count}\n`;
          });
        }
        
        output += `\nInformación encontrada:`;
        return output;
      }
      
      // Si es un conteo
      if (firstResult.result && typeof firstResult.result.count === 'number') {
        return `count: ${firstResult.result.count}`;
      }
      
      // Por defecto, devolver como JSON
      return JSON.stringify(firstResult.result, null, 2);
    } catch (error) {
      logger.error(LOG_CATEGORY.FORMATTER, `Error al formatear resultados: ${error.message}`, { error });
      return `Error al formatear resultados: ${error.message}`;
    }
  }
}

export default EnhancedFirebaseService;