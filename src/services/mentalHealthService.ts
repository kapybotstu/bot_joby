export interface MentalHealthResponse {
    questionId: number
    question: string
    answer: string
    timestamp: Date
    analysisNote?: string
}

export interface DigitalSignals {
    responseSpeed: number[] // velocidad de respuesta en segundos
    messageLength: number[] // longitud de mensajes
    emojiUsage: number // cantidad de emojis usados
    formalityLevel: number // nivel de formalidad (1-5)
    pausePatterns: number[] // tiempo entre mensajes
    errorCorrections: number // autocorrecciones detectadas
    audioUsage: number // cantidad de mensajes de audio vs texto
}

export interface MentalHealthAssessment {
    userId: string
    responses: MentalHealthResponse[]
    digitalSignals: DigitalSignals
    stressLevel: 'bajo' | 'moderado' | 'alto'
    depressionIndicators: string[]
    recommendedBenefit: string
    riskLevel: 'bajo' | 'moderado' | 'alto'
    completedAt: Date
}

export class MentalHealthService {
    private assessments: Map<string, Partial<MentalHealthAssessment> & { selectedQuestions?: string[], lastMessageTime?: number }> = new Map()
    
    private stressDepressionQuestions = [
        "¿Cómo describirías tu estado de ánimo general durante tu jornada laboral? ¿Te sientes motivado, neutral o más bien desanimado?",
        "En las últimas semanas, ¿cómo ha sido tu calidad de sueño? ¿Duermes las horas necesarias y descansas bien?",
        "Durante tu día de trabajo, ¿cómo son tus niveles de energía? ¿Te sientes con fuerzas o experimentas cansancio frecuente?",
        "¿Cómo evaluarías tu capacidad de concentración y productividad en el trabajo últimamente?",
        "¿Has notado cambios en tus hábitos alimenticios o en el consumo de café, alcohol u otras sustancias desde que trabajas aquí?",
        "¿Con qué frecuencia tienes pensamientos ansiosos o negativos relacionados con tu trabajo o futuro profesional?",
        "¿Cómo te sientes respecto a tu entorno laboral y las relaciones con tus compañeros o supervisores?",
        "Cuando enfrentas situaciones de presión o conflicto en el trabajo, ¿experimentas reacciones físicas como palpitaciones, tensión muscular o dolor de cabeza?",
        "¿Has notado cambios en tu rendimiento laboral o cometes errores con más frecuencia que antes?",
        "¿Qué estrategias usas para manejar el estrés laboral y qué tipo de apoyo recibes de familia, amigos o compañeros?"
    ]

    private benefits = [
        "Suscripción Pase de batalla - Gamer",
        "Tour en Bicicleta - Deporte",
        "Asesoría Viajes - Lifestyle",
        "Sesión Salud Mental Niños y Adultos - Autocuidado",
        "Entrada Museo Interactivo Mirador - Panoramas y Familia",
        "Rally Karting - Deporte",
        "Go Karting - Deporte",
        "Speerpark - Deporte",
        "Plan Entrenamiento Mensual - Deporte",
        "Caja Maifud Fruras y Verduras - Lifestyle",
        "Pack 5 Shots Wake Up KEFFI - Lifestyle",
        "Libro Pasaporte Literario - Cultura y Artes",
        "Box Figuras Yeso - Cultura y Artes",
        "Pack Café Adictos - Lifestyle",
        "Pack Té Adictos - Lifestyle",
        "Pack Chocolates - Lifestyle",
        "Eleva tu inglés - Vida Profesional",
        "Coaching de carrera - Vida Profesional",
        "Caja de cremas y maquillaje - Autocuidado",
        "Ramen Ryoma - Comidas del mundo",
        "Mirai Food - Comidas del mundo",
        "Loquissima Pasta - Comidas del mundo",
        "Tijuana Tacos - Comidas del mundo",
        "Rishtedar Hindú - Comidas del mundo",
        "Gohan a domicilio - Comidas del mundo",
        "Burger a domicilio - Comidas del mundo",
        "Sandwich a domicilio - Comidas del mundo",
        "Comida China a domicilio - Comidas del Mundo",
        "Manicure Esmaltado Tradicional - Autocuidado",
        "Manicure Infantil - Autocuidado",
        "Perfilación de cejas - Autocuidado",
        "Car washing - Mundo tuercas",
        "Caja sorpresa para tu mascota - Mascotas",
        "Spa de mascota - Mascotas",
        "Sesión con nutricionista - Autocuidado",
        "Jumper Park Santiago - Panoramas y Familia",
        "Trampolin Park Santiago - Panoramas y Familia",
        "Bar On Tap - Cervezas y Amigos",
        "Bar y Vuelvo - Cervezas y Amigos",
        "Bar ChaChan - Cervezas y Amigos",
        "Inicia tu viaje en la fotografía - Hobbies y Pasatiempos",
        "Comienza tu viaje en el dibujo - Hobbies y Pasatiempos",
        "Planetario Santiago - Cultura y Arte",
        "Teatro Matucana 100 - Cultura y Arte",
        "Eventos del mes - Cultura y Arte"
    ]

    startAssessment(userId: string): string {
        this.assessments.set(userId, {
            userId,
            responses: [],
            digitalSignals: {
                responseSpeed: [],
                messageLength: [],
                emojiUsage: 0,
                formalityLevel: 3,
                pausePatterns: [],
                errorCorrections: 0,
                audioUsage: 0
            }
        })

        return `Hola, soy tu asistente especializado en bienestar laboral. 

Me gustaría ayudarte a conocer mejor tu estado emocional en el trabajo y recomendarte beneficios personalizados que podrían ser útiles para ti.

**¿Me das tu consentimiento para recopilar información sobre tu estado emocional, hábitos laborales e intereses?**

Esta información se usará exclusivamente para:
- Generar un modelo digital de tu salud mental laboral
- Hacer una recomendación personalizada de beneficio
- Todo será tratado con absoluta confidencialidad

*Nota: Esto no constituye un diagnóstico médico profesional.*

¿Estás de acuerdo en continuar?`
    }

    async processResponse(userId: string, answer: string, metadata: { isAudio: boolean, responseTime: number }): Promise<string> {
        const assessment = this.assessments.get(userId)
        if (!assessment) {
            return "Por favor, primero acepta participar en la evaluación escribiendo 'sí' o 'acepto'."
        }

        // Actualizar señales digitales
        this.updateDigitalSignals(assessment, answer, metadata)

        const currentQuestionIndex = assessment.responses?.length || 0

        // Si es la primera respuesta, verificar consentimiento
        if (currentQuestionIndex === 0) {
            if (!this.isConsentGiven(answer)) {
                return "Entiendo. Si cambias de opinión, puedes escribir 'evaluar salud mental' cuando gustes. ¿En qué más puedo ayudarte?"
            }
            
            // Consentimiento dado, hacer primera pregunta
            const selectedQuestions = this.selectRandomQuestions()
            assessment.selectedQuestions = selectedQuestions
            
            const firstQuestion = selectedQuestions[0]
            assessment.responses!.push({
                questionId: 0,
                question: "consentimiento",
                answer: answer,
                timestamp: new Date()
            })

            return `¡Perfecto! Muchas gracias por tu confianza. 

**Pregunta 1 de 6:**
${firstQuestion}`
        }

        // Procesar respuesta a pregunta específica
        const questionIndex = currentQuestionIndex - 1 // -1 por el consentimiento
        const selectedQuestions = assessment.selectedQuestions!
        
        if (questionIndex < 5) {
            // Guardar respuesta actual
            assessment.responses!.push({
                questionId: questionIndex + 1,
                question: selectedQuestions[questionIndex],
                answer: answer,
                timestamp: new Date(),
                analysisNote: this.generateQuickAnalysis(answer, questionIndex)
            })

            const analysisNote = this.generateQuickAnalysis(answer, questionIndex)
            
            if (questionIndex < 4) {
                // Siguiente pregunta (preguntas 2-5)
                const nextQuestion = selectedQuestions[questionIndex + 1]
                return `Gracias por compartir esa información. ${analysisNote}

**Pregunta ${questionIndex + 2} de 6:**
${nextQuestion}`
            } else {
                // Pregunta 6 (intereses)
                return `Gracias por compartir esa información. ${analysisNote}

**Pregunta 6 de 6:**
¿Con qué categoría de actividades te identificas más para tu tiempo libre?

a) Deportes y actividad física
b) Vida social y entretenimiento 
c) Cultura, arte y aprendizaje
d) Autocuidado y bienestar personal
e) Hobbies creativos y pasatiempos
f) Gastronomía y experiencias culinarias
g) Familia y actividades con niños
h) Desarrollo profesional
i) Tecnología y gaming`
            }
        } else {
            // Respuesta final (intereses) - generar informe
            assessment.responses!.push({
                questionId: 6,
                question: "categoría de intereses",
                answer: answer,
                timestamp: new Date()
            })

            return await this.generateFinalReport(userId)
        }
    }

    private selectRandomQuestions(): string[] {
        // Seleccionar 5 preguntas aleatorias de las 10 disponibles
        const shuffled = [...this.stressDepressionQuestions].sort(() => 0.5 - Math.random())
        return shuffled.slice(0, 5)
    }

    private isConsentGiven(answer: string): boolean {
        const positive = ['sí', 'si', 'acepto', 'ok', 'está bien', 'de acuerdo', 'yes', 'dale', 'por supuesto']
        return positive.some(word => answer.toLowerCase().includes(word))
    }

    private updateDigitalSignals(assessment: Partial<MentalHealthAssessment>, answer: string, metadata: { isAudio: boolean, responseTime: number }) {
        if (!assessment.digitalSignals) return

        // Calcular velocidad de respuesta real
        assessment.digitalSignals.responseSpeed.push(metadata.responseTime)
        
        // Longitud del mensaje
        assessment.digitalSignals.messageLength.push(answer.length)
        
        // Contar emojis (regex más completa)
        const emojiCount = (answer.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length
        assessment.digitalSignals.emojiUsage += emojiCount
        
        // Contar uso de audio
        if (metadata.isAudio) {
            assessment.digitalSignals.audioUsage++
        }

        // Analizar nivel de formalidad más sofisticado
        const formalWords = ['usted', 'señor', 'señora', 'estimado', 'cordialmente', 'gracias', 'por favor', 'disculpe']
        const informalWords = ['jaja', 'xd', 'jeje', 'onda', 'bacán', 'genial', 'wena', 'buenísimo', 'súper', 'jajaja']
        const casualWords = ['sí', 'ok', 'dale', 'ya', 'eso', 'claro', 'obvio']
        
        const formalCount = formalWords.filter(word => answer.toLowerCase().includes(word)).length
        const informalCount = informalWords.filter(word => answer.toLowerCase().includes(word)).length
        const casualCount = casualWords.filter(word => answer.toLowerCase().includes(word)).length
        
        // Ajustar formalidad basado en patrones detectados
        if (formalCount > informalCount + casualCount) {
            assessment.digitalSignals.formalityLevel = Math.min(5, assessment.digitalSignals.formalityLevel + 0.3)
        } else if (informalCount > formalCount) {
            assessment.digitalSignals.formalityLevel = Math.max(1, assessment.digitalSignals.formalityLevel - 0.4)
        } else if (casualCount > 0) {
            assessment.digitalSignals.formalityLevel = Math.max(1, assessment.digitalSignals.formalityLevel - 0.2)
        }
        
        // Detectar autocorrecciones (palabras con asteriscos o repeticiones)
        if (answer.includes('*') || answer.includes('quise decir') || /\b(\w+)\s+\1\b/.test(answer)) {
            assessment.digitalSignals.errorCorrections++
        }
        
        // Calcular pausas entre mensajes
        const currentTime = Date.now()
        if (assessment.lastMessageTime) {
            const pauseTime = (currentTime - assessment.lastMessageTime) / 1000
            assessment.digitalSignals.pausePatterns.push(pauseTime)
        }
        assessment.lastMessageTime = currentTime
    }

    private generateQuickAnalysis(answer: string, questionIndex: number): string {
        const analyses = [
            "Noto que estás reflexionando sobre tu estado emocional, esto es muy positivo para el autoconocimiento.",
            "El sueño es fundamental para el bienestar mental, gracias por ser honesto sobre este aspecto.",
            "Los niveles de energía nos dicen mucho sobre cómo estamos manejando las demandas laborales.",
            "La concentración y productividad son indicadores clave de nuestro bienestar cognitivo.",
            "Los cambios en hábitos pueden ser señales importantes de cómo el trabajo nos está afectando."
        ]
        
        return analyses[questionIndex] || "Gracias por compartir esta información tan valiosa."
    }

    private async generateFinalReport(userId: string): Promise<string> {
        const assessment = this.assessments.get(userId)!
        
        // Análisis de riesgo
        const riskAnalysis = this.analyzeRisk(assessment.responses!)
        const recommendedBenefit = this.recommendBenefit(assessment.responses!)
        
        // Completar assessment
        assessment.stressLevel = riskAnalysis.stressLevel
        assessment.depressionIndicators = riskAnalysis.indicators
        assessment.recommendedBenefit = recommendedBenefit
        assessment.riskLevel = riskAnalysis.riskLevel
        assessment.completedAt = new Date()

        // Resumen de respuestas
        const responseSummary = assessment.responses!
            .filter(r => r.questionId > 0)
            .map(r => `**Pregunta ${r.questionId}:** ${r.answer}`)
            .join('\n\n')

        // Informe principal
        const mainReport = this.generateMainReport(assessment as MentalHealthAssessment)
        
        // Informe de señales digitales
        const digitalReport = this.generateDigitalSignalsReport(assessment.digitalSignals!)

        return `## EVALUACIÓN COMPLETADA ✅

### Resumen de tus respuestas:
${responseSummary}

---

${mainReport}

---

${digitalReport}

*Recuerda: Esta evaluación no constituye un diagnóstico médico. Si sientes que necesitas apoyo adicional, no dudes en contactar a un profesional de la salud mental.*`
    }

    private analyzeRisk(responses: MentalHealthResponse[]): { stressLevel: 'bajo' | 'moderado' | 'alto', indicators: string[], riskLevel: 'bajo' | 'moderado' | 'alto' } {
        let riskScore = 0
        const indicators: string[] = []

        responses.forEach(response => {
            const answer = response.answer.toLowerCase()
            
            // Indicadores negativos de estado de ánimo
            if (answer.includes('triste') || answer.includes('desanimado') || answer.includes('deprimido') || 
                answer.includes('desmotivado') || answer.includes('mal') || answer.includes('horrible')) {
                riskScore += 3
                indicators.push('Estado de ánimo bajo detectado')
            }
            
            // Problemas de sueño
            if (answer.includes('no duermo') || answer.includes('insomnio') || answer.includes('mal sueño') ||
                answer.includes('poco sueño') || answer.includes('despertar') || answer.includes('no descanso')) {
                riskScore += 2
                indicators.push('Alteraciones del sueño')
            }
            
            // Fatiga y energía
            if (answer.includes('cansado') || answer.includes('sin energía') || answer.includes('agotado') ||
                answer.includes('exhausto') || answer.includes('muy cansado') || answer.includes('sin fuerzas')) {
                riskScore += 2
                indicators.push('Fatiga significativa')
            }
            
            // Problemas de concentración
            if (answer.includes('no me concentro') || answer.includes('distraído') || answer.includes('productividad baja') ||
                answer.includes('no rindo') || answer.includes('errores') || answer.includes('no puedo concentrarme')) {
                riskScore += 2
                indicators.push('Dificultades cognitivas')
            }
            
            // Ansiedad y estrés
            if (answer.includes('ansioso') || answer.includes('estresado') || answer.includes('preocupado') ||
                answer.includes('nervioso') || answer.includes('tenso') || answer.includes('agobiado')) {
                riskScore += 2
                indicators.push('Síntomas de ansiedad/estrés')
            }
            
            // Síntomas físicos
            if (answer.includes('dolor de cabeza') || answer.includes('palpitaciones') || answer.includes('tensión') ||
                answer.includes('dolor') || answer.includes('mareos') || answer.includes('nauseas')) {
                riskScore += 1
                indicators.push('Síntomas físicos de estrés')
            }
            
            // Aislamiento social
            if (answer.includes('solo') || answer.includes('aislado') || answer.includes('no hablo') ||
                answer.includes('evito') || answer.includes('no socializo')) {
                riskScore += 2
                indicators.push('Tendencias de aislamiento')
            }
            
            // Cambios en hábitos
            if (answer.includes('como más') || answer.includes('como menos') || answer.includes('alcohol') ||
                answer.includes('fumo más') || answer.includes('medicación')) {
                riskScore += 1
                indicators.push('Cambios en hábitos de consumo')
            }
            
            // Indicadores positivos (reducen el riesgo)
            if (answer.includes('bien') || answer.includes('genial') || answer.includes('excelente') ||
                answer.includes('perfecto') || answer.includes('muy bien') || answer.includes('feliz')) {
                riskScore = Math.max(0, riskScore - 1)
            }
        })

        let riskLevel: 'bajo' | 'moderado' | 'alto'
        if (riskScore <= 3) {
            riskLevel = 'bajo'
        } else if (riskScore <= 7) {
            riskLevel = 'moderado'
        } else {
            riskLevel = 'alto'
        }

        const stressLevel = riskLevel

        return { stressLevel, indicators, riskLevel }
    }

    private recommendBenefit(responses: MentalHealthResponse[]): string {
        const interestsResponse = responses.find(r => r.questionId === 6)?.answer.toLowerCase() || ''
        const riskAnalysis = this.analyzeRisk(responses)

        // Si hay alto riesgo, priorizar autocuidado
        if (riskAnalysis.riskLevel === 'alto') {
            return "Sesión Salud Mental Niños y Adultos - Autocuidado"
        }

        // Mapear intereses a beneficios
        if (interestsResponse.includes('a') || interestsResponse.includes('deporte')) {
            return "Plan Entrenamiento Mensual - Deporte"
        }
        
        if (interestsResponse.includes('b') || interestsResponse.includes('social')) {
            return "Bar On Tap - Cervezas y Amigos"
        }
        
        if (interestsResponse.includes('c') || interestsResponse.includes('cultura') || interestsResponse.includes('arte')) {
            return "Teatro Matucana 100 - Cultura y Arte"
        }
        
        if (interestsResponse.includes('d') || interestsResponse.includes('autocuidado') || interestsResponse.includes('bienestar')) {
            return "Sesión con nutricionista - Autocuidado"
        }
        
        if (interestsResponse.includes('e') || interestsResponse.includes('hobbies') || interestsResponse.includes('creativos')) {
            return "Inicia tu viaje en la fotografía - Hobbies y Pasatiempos"
        }
        
        if (interestsResponse.includes('f') || interestsResponse.includes('gastronomía') || interestsResponse.includes('comida')) {
            return "Ramen Ryoma - Comidas del mundo"
        }
        
        if (interestsResponse.includes('g') || interestsResponse.includes('familia') || interestsResponse.includes('niños')) {
            return "Jumper Park Santiago - Panoramas y Familia"
        }
        
        if (interestsResponse.includes('h') || interestsResponse.includes('profesional') || interestsResponse.includes('desarrollo')) {
            return "Coaching de carrera - Vida Profesional"
        }
        
        if (interestsResponse.includes('i') || interestsResponse.includes('tecnología') || interestsResponse.includes('gaming')) {
            return "Suscripción Pase de batalla - Gamer"
        }

        // Default
        return "Pack Chocolates - Lifestyle"
    }

    private generateMainReport(assessment: MentalHealthAssessment): string {
        const riskText = assessment.riskLevel === 'alto' ? 'ALTO' : assessment.riskLevel === 'moderado' ? 'MODERADO' : 'BAJO'
        const indicators = assessment.depressionIndicators.length > 0 ? assessment.depressionIndicators.join(', ') : 'No se detectaron indicadores significativos'
        
        // Generar descripción más específica basada en indicadores
        let emotionalState = ''
        if (assessment.riskLevel === 'alto') {
            emotionalState = 'Se detectan múltiples indicadores que sugieren un nivel elevado de estrés laboral que requiere atención prioritaria'
        } else if (assessment.riskLevel === 'moderado') {
            emotionalState = 'Se observan algunos indicadores de estrés laboral que ameritan seguimiento y estrategias de manejo'
        } else {
            emotionalState = 'Los indicadores sugieren un estado emocional estable dentro del contexto laboral'
        }
        
        // Generar recomendaciones específicas
        let specificRecommendations = ''
        if (assessment.depressionIndicators.includes('Alteraciones del sueño')) {
            specificRecommendations += '• Implementar rutinas de higiene del sueño\n'
        }
        if (assessment.depressionIndicators.includes('Síntomas de ansiedad/estrés')) {
            specificRecommendations += '• Practicar técnicas de relajación y mindfulness\n'
        }
        if (assessment.depressionIndicators.includes('Fatiga significativa')) {
            specificRecommendations += '• Evaluar balance vida-trabajo y pausas durante la jornada\n'
        }
        if (assessment.depressionIndicators.includes('Dificultades cognitivas')) {
            specificRecommendations += '• Implementar técnicas de organización y priorización de tareas\n'
        }
        
        const professionalAdvice = assessment.riskLevel === 'alto' 
            ? "\n\n⚠️ **RECOMENDACIÓN IMPORTANTE**: Dado el nivel de riesgo detectado, te recomendamos encarecidamente buscar apoyo de un profesional de salud mental."
            : assessment.riskLevel === 'moderado'
            ? "\n\n💡 **SUGERENCIA**: Considera implementar estrategias de autocuidado y monitorear tu bienestar emocional."
            : ""

        const recommendationJustification = this.generateRecommendationJustification(assessment)

        return `## INFORME DE EVALUACIÓN DE SALUD MENTAL LABORAL

### 1. Resumen de Hallazgos Emocionales y Conductuales
**Nivel de riesgo detectado: ${riskText}**

**Indicadores identificados:** ${indicators}

**Análisis:** ${emotionalState}

${specificRecommendations ? `**Recomendaciones específicas:**\n${specificRecommendations}` : ''}

### 2. Modelo Digital de Salud Mental
${this.generateBehaviorAnalysis(assessment)}

### 3. Recomendación de Beneficio
**Beneficio recomendado:** ${assessment.recommendedBenefit}

**Justificación:** ${recommendationJustification}${professionalAdvice}`
    }

    private generateRecommendationJustification(assessment: MentalHealthAssessment): string {
        const interestsResponse = assessment.responses.find(r => r.questionId === 6)?.answer.toLowerCase() || ''
        const benefitCategory = assessment.recommendedBenefit.split(' - ')[1] || ''
        
        let justification = `Este beneficio de ${benefitCategory.toLowerCase()} ha sido seleccionado `
        
        if (assessment.riskLevel === 'alto') {
            justification += 'priorizando tu bienestar mental inmediato y la necesidad de estrategias efectivas de manejo del estrés'
        } else if (assessment.riskLevel === 'moderado') {
            justification += 'para complementar tu bienestar actual y prevenir el escalamiento de síntomas de estrés'
        } else {
            justification += 'considerando tus intereses personales y como estrategia de mantenimiento del bienestar'
        }
        
        if (interestsResponse.includes('a') || interestsResponse.includes('deporte')) {
            justification += '. La actividad física es especialmente beneficiosa para reducir cortisol y liberar endorfinas'
        } else if (interestsResponse.includes('d') || interestsResponse.includes('autocuidado')) {
            justification += '. Las prácticas de autocuidado son fundamentales para mantener un equilibrio emocional saludable'
        }
        
        return justification + '.'
    }

    private generateBehaviorAnalysis(assessment: MentalHealthAssessment): string {
        const avgResponseTime = assessment.digitalSignals.responseSpeed.reduce((a, b) => a + b, 0) / assessment.digitalSignals.responseSpeed.length || 0
        const avgMessageLength = assessment.digitalSignals.messageLength.reduce((a, b) => a + b, 0) / assessment.digitalSignals.messageLength.length || 0
        
        let analysis = `Basado en tus respuestas y patrones de comunicación digital, se observa `
        
        if (avgResponseTime > 60) {
            analysis += 'un tiempo de reflexión considerable antes de responder, sugiriendo procesamiento cuidadoso de las preguntas. '
        } else if (avgResponseTime < 10) {
            analysis += 'respuestas rápidas que pueden indicar claridad en tus percepciones o posible ansiedad. '
        } else {
            analysis += 'un tiempo de respuesta equilibrado que sugiere reflexión apropiada. '
        }
        
        if (assessment.digitalSignals.audioUsage > assessment.digitalSignals.responseSpeed.length / 2) {
            analysis += 'Tu preferencia por mensajes de voz indica comodidad expresiva y naturalidad comunicativa. '
        }
        
        if (assessment.digitalSignals.emojiUsage === 0) {
            analysis += 'La ausencia de emojis sugiere un enfoque más formal o reservado en la comunicación. '
        } else if (assessment.digitalSignals.emojiUsage > 3) {
            analysis += 'El uso de emojis indica expresividad emocional y apertura comunicativa. '
        }
        
        if (assessment.riskLevel === 'bajo') {
            analysis += 'En general, los patrones sugieren un estado emocional equilibrado y estrategias de comunicación saludables.'
        } else if (assessment.riskLevel === 'moderado') {
            analysis += 'Los patrones revelan algunas señales que ameritan atención para mantener el bienestar emocional.'
        } else {
            analysis += 'Los patrones de comunicación reflejan la necesidad de apoyo adicional y estrategias de manejo del estrés.'
        }
        
        return analysis
    }

    private generateDigitalSignalsReport(signals: DigitalSignals): string {
        const avgResponseTime = signals.responseSpeed.reduce((a, b) => a + b, 0) / signals.responseSpeed.length || 0
        const avgMessageLength = signals.messageLength.reduce((a, b) => a + b, 0) / signals.messageLength.length || 0
        const avgPauseTime = signals.pausePatterns.length > 0 ? signals.pausePatterns.reduce((a, b) => a + b, 0) / signals.pausePatterns.length : 0
        const totalMessages = signals.responseSpeed.length
        const audioPercentage = totalMessages > 0 ? (signals.audioUsage / totalMessages * 100) : 0
        
        return `## ANÁLISIS DE SEÑALES DIGITALES

### Métricas de Comportamiento Digital:
- **Velocidad de respuesta promedio:** ${avgResponseTime.toFixed(1)} segundos
- **Longitud promedio de mensajes:** ${avgMessageLength.toFixed(0)} caracteres  
- **Uso de emojis:** ${signals.emojiUsage} emojis utilizados en ${totalMessages} mensajes
- **Nivel de formalidad:** ${signals.formalityLevel.toFixed(1)}/5.0
- **Uso de audio:** ${signals.audioUsage} mensajes de voz (${audioPercentage.toFixed(1)}% del total)
- **Tiempo entre mensajes:** ${avgPauseTime.toFixed(1)} segundos promedio
- **Autocorrecciones detectadas:** ${signals.errorCorrections}

### Correlación con Indicadores Emocionales:
${this.correlateDigitalSignals(signals, totalMessages, avgResponseTime, avgPauseTime)}`
    }

    private correlateDigitalSignals(signals: DigitalSignals, totalMessages: number, avgResponseTime: number, avgPauseTime: number): string {
        const insights: string[] = []
        
        // Análisis de velocidad de respuesta
        if (avgResponseTime > 60) {
            insights.push("• Tiempo de respuesta elevado (>60s) sugiere reflexión cuidadosa o posible dificultad para verbalizar emociones")
        } else if (avgResponseTime < 5) {
            insights.push("• Respuestas muy rápidas (<5s) pueden indicar respuestas automáticas o evitación de reflexión profunda")
        } else {
            insights.push("• Tiempo de respuesta equilibrado indica procesamiento emocional apropiado")
        }
        
        // Análisis de emojis
        const emojiRatio = totalMessages > 0 ? signals.emojiUsage / totalMessages : 0
        if (signals.emojiUsage === 0) {
            insights.push("• Ausencia total de emojis puede sugerir estado emocional más reservado, formal o posible inhibición expresiva")
        } else if (emojiRatio > 0.5) {
            insights.push("• Uso frecuente de emojis indica expresividad emocional saludable y apertura comunicativa")
        } else if (emojiRatio > 0) {
            insights.push("• Uso moderado de emojis sugiere equilibrio entre expresividad y formalidad")
        }
        
        // Análisis de formalidad
        if (signals.formalityLevel > 4) {
            insights.push("• Alto nivel de formalidad puede indicar distancia emocional, ansiedad social o mecanismo de protección")
        } else if (signals.formalityLevel < 2) {
            insights.push("• Baja formalidad sugiere comodidad y naturalidad en la expresión emocional")
        }
        
        // Análisis de uso de audio
        const audioPercentage = totalMessages > 0 ? (signals.audioUsage / totalMessages * 100) : 0
        if (audioPercentage > 70) {
            insights.push("• Fuerte preferencia por audio indica alta comodidad expresiva y procesamiento emocional fluido")
        } else if (audioPercentage > 30) {
            insights.push("• Uso equilibrado de audio sugiere flexibilidad comunicativa y expresión emocional natural")
        } else if (audioPercentage === 0) {
            insights.push("• Preferencia exclusiva por texto puede indicar mayor control sobre la expresión o comodidad con la escritura")
        }
        
        // Análisis de pausas
        if (avgPauseTime > 120) {
            insights.push("• Pausas largas entre mensajes pueden indicar procesamiento emocional complejo o evitación temporal")
        } else if (avgPauseTime < 10) {
            insights.push("• Pausas mínimas sugieren fluidez en el procesamiento emocional o posible impulsividad")
        }
        
        // Análisis de autocorrecciones
        if (signals.errorCorrections > 2) {
            insights.push("• Múltiples autocorrecciones pueden indicar ansiedad de rendimiento o perfeccionismo")
        } else if (signals.errorCorrections === 0) {
            insights.push("• Ausencia de autocorrecciones sugiere confianza en la expresión o procesamiento claro")
        }
        
        // Análisis integrado
        if (avgResponseTime > 30 && signals.emojiUsage === 0 && signals.formalityLevel > 3.5) {
            insights.push("• **Patrón detectado**: Combinación de respuestas lentas, formalidad alta y ausencia de emojis puede sugerir inhibición emocional o estrés comunicativo")
        }
        
        if (audioPercentage > 50 && emojiRatio > 0.3 && signals.formalityLevel < 3) {
            insights.push("• **Patrón positivo**: Alta expresividad a través de múltiples canales sugiere bienestar emocional y comunicación saludable")
        }
        
        return insights.length > 0 ? insights.join('\n') : "• Los patrones digitales muestran un comportamiento comunicativo dentro de parámetros estándar"
    }

    isUserInMentalHealthAssessment(userId: string): boolean {
        const assessment = this.assessments.get(userId)
        return !!(assessment && !assessment.completedAt)
    }

    getUserAssessment(userId: string): Partial<MentalHealthAssessment> | undefined {
        return this.assessments.get(userId)
    }
}