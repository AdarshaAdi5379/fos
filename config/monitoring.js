const config = require('./environment');
const { logger, getMetrics, performanceLogger } = require('./logging');
const dbConfig = require('./database');

class HealthMonitor {
  constructor() {
    this.checks = new Map();
    this.lastResults = new Map();
    this.setupDefaultChecks();
  }

  setupDefaultChecks() {
    // Database health check
    this.addCheck('database', async () => {
      try {
        const result = await dbConfig.query('SELECT 1 as health_check');
        return {
          status: 'healthy',
          message: 'Database connection successful',
          details: {
            type: config.database.type,
            result: result
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: 'Database connection failed',
          details: { error: error.message }
        };
      }
    });

    // Redis health check (if configured)
    if (config.redis) {
      this.addCheck('redis', async () => {
        try {
          const Redis = require('redis');
          const client = Redis.createClient(config.redis);
          
          await client.connect();
          await client.ping();
          await client.quit();
          
          return {
            status: 'healthy',
            message: 'Redis connection successful'
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: 'Redis connection failed',
            details: { error: error.message }
          };
        }
      });
    }

    // Memory usage check
    this.addCheck('memory', async () => {
      const usage = process.memoryUsage();
      const totalMemory = usage.heapTotal;
      const usedMemory = usage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      const status = memoryUsagePercent > 90 ? 'unhealthy' : 
                    memoryUsagePercent > 80 ? 'warning' : 'healthy';

      return {
        status,
        message: `Memory usage: ${memoryUsagePercent.toFixed(2)}%`,
        details: {
          total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
          used: `${Math.round(usedMemory / 1024 / 1024)}MB`,
          percentage: `${memoryUsagePercent.toFixed(2)}%`
        }
      };
    });

    // Disk space check (for SQLite)
    if (config.database.type === 'sqlite') {
      this.addCheck('disk', async () => {
        try {
          const fs = require('fs');
          const path = require('path');
          const stats = fs.statSync(path.dirname(config.database.path));
          
          // Simple check - in production you'd want more sophisticated disk monitoring
          return {
            status: 'healthy',
            message: 'Disk space available'
          };
        } catch (error) {
          return {
            status: 'warning',
            message: 'Could not check disk space',
            details: { error: error.message }
          };
        }
      });
    }
  }

  addCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  async runCheck(name) {
    const checkFunction = this.checks.get(name);
    if (!checkFunction) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = Date.now();
    
    try {
      const result = await checkFunction();
      const duration = Date.now() - startTime;
      
      const healthResult = {
        name,
        status: result.status,
        message: result.message,
        duration: `${duration}ms`,
        details: result.details || {},
        timestamp: new Date().toISOString()
      };

      this.lastResults.set(name, healthResult);
      return healthResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const errorResult = {
        name,
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        duration: `${duration}ms`,
        details: { error: error.message },
        timestamp: new Date().toISOString()
      };

      this.lastResults.set(name, errorResult);
      return errorResult;
    }
  }

  async runAllChecks() {
    const startTime = Date.now();
    const checkPromises = Array.from(this.checks.keys()).map(name => 
      this.runCheck(name)
    );

    const results = await Promise.all(checkPromises);
    const totalDuration = Date.now() - startTime;

    const overallStatus = results.some(r => r.status === 'unhealthy') ? 'unhealthy' :
                         results.some(r => r.status === 'warning') ? 'warning' : 'healthy';

    const healthReport = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      totalDuration: `${totalDuration}ms`,
      checks: results,
      summary: {
        total: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        warning: results.filter(r => r.status === 'warning').length,
        unhealthy: results.filter(r => r.status === 'unhealthy').length
      }
    };

    // Log health check results
    logger.info('Health check completed', {
      status: overallStatus,
      totalDuration: `${totalDuration}ms`,
      summary: healthReport.summary
    });

    return healthReport;
  }

  getLastResults() {
    return Object.fromEntries(this.lastResults);
  }

  // Start periodic health checks
  startPeriodicChecks(intervalMs = 300000) { // 5 minutes default
    setInterval(async () => {
      await this.runAllChecks();
    }, intervalMs);
    
    logger.info(`Periodic health checks started (interval: ${intervalMs}ms)`);
  }
}

// Performance monitor
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        averageResponseTime: 0,
        slowRequests: 0
      },
      database: {
        queries: 0,
        slowQueries: 0,
        averageQueryTime: 0
      },
      websockets: {
        connections: 0,
        disconnections: 0,
        messages: 0
      }
    };
  }

  recordRequest(statusCode, responseTime) {
    this.metrics.requests.total++;
    
    if (!this.metrics.requests.byStatus[statusCode]) {
      this.metrics.requests.byStatus[statusCode] = 0;
    }
    this.metrics.requests.byStatus[statusCode]++;
    
    if (responseTime > 1000) {
      this.metrics.requests.slowRequests++;
    }
    
    this.updateAverageResponseTime(responseTime);
  }

  updateAverageResponseTime(responseTime) {
    const total = this.metrics.requests.total;
    const currentAvg = this.metrics.requests.averageResponseTime;
    this.metrics.requests.averageResponseTime = 
      ((currentAvg * (total - 1)) + responseTime) / total;
  }

  recordDatabaseQuery(queryTime) {
    this.metrics.database.queries++;
    
    if (queryTime > 100) {
      this.metrics.database.slowQueries++;
    }
    
    const total = this.metrics.database.queries;
    const currentAvg = this.metrics.database.averageQueryTime;
    this.metrics.database.averageQueryTime = 
      ((currentAvg * (total - 1)) + queryTime) / total;
  }

  recordWebSocketConnection(type) {
    if (type === 'connect') {
      this.metrics.websockets.connections++;
    } else if (type === 'disconnect') {
      this.metrics.websockets.disconnections++;
    } else if (type === 'message') {
      this.metrics.websockets.messages++;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      errorRate: this.calculateErrorRate(),
      slowRequestRate: this.calculateSlowRequestRate(),
      slowQueryRate: this.calculateSlowQueryRate()
    };
  }

  calculateErrorRate() {
    const total = this.metrics.requests.total;
    if (total === 0) return 0;
    
    const errorStatuses = Object.keys(this.metrics.requests.byStatus)
      .filter(status => parseInt(status) >= 400);
    
    const errorCount = errorStatuses.reduce((sum, status) => 
      sum + this.metrics.requests.byStatus[status], 0);
    
    return (errorCount / total * 100).toFixed(2);
  }

  calculateSlowRequestRate() {
    const total = this.metrics.requests.total;
    if (total === 0) return 0;
    
    return (this.metrics.requests.slowRequests / total * 100).toFixed(2);
  }

  calculateSlowQueryRate() {
    const total = this.metrics.database.queries;
    if (total === 0) return 0;
    
    return (this.metrics.database.slowQueries / total * 100).toFixed(2);
  }

  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        averageResponseTime: 0,
        slowRequests: 0
      },
      database: {
        queries: 0,
        slowQueries: 0,
        averageQueryTime: 0
      },
      websockets: {
        connections: 0,
        disconnections: 0,
        messages: 0
      }
    };
  }
}

module.exports = {
  HealthMonitor,
  PerformanceMonitor
};