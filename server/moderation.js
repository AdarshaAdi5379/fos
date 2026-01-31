const crypto = require('crypto');

class ContentModeration {
  static checkContent(content) {
    const violations = [];
    
    // Check for extremely long content
    if (content.length > 10000) {
      violations.push('Content too long');
    }
    
    // Check for potential spam patterns
    if (this.isSpam(content)) {
      violations.push('Potential spam detected');
    }
    
    // Check for repeated characters (possible abuse)
    if (this.hasExcessiveRepetition(content)) {
      violations.push('Excessive repetition detected');
    }
    
    return violations;
  }
  
  static isSpam(content) {
    // Simple spam detection patterns
    const spamPatterns = [
      /(.)\1{20,}/, // 20+ repeated characters
      /http[s]?:\/\/[^\s]{50,}/, // Very long URLs
      /\$[A-Z]{3,}\s*\$[A-Z]{3,}/, // Multiple stock tickers
      /buy\s+now|click\s+here|free\s+money/i, // Common spam phrases
    ];
    
    return spamPatterns.some(pattern => pattern.test(content));
  }
  
  static hasExcessiveRepetition(content) {
    // Check for excessive line repetition
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 10) {
      const uniqueLines = new Set(lines.map(line => line.trim().toLowerCase()));
      if (uniqueLines.size < lines.length * 0.3) {
        return true;
      }
    }
    
    // Check for word repetition
    const words = content.toLowerCase().split(/\s+/);
    if (words.length > 20) {
      const uniqueWords = new Set(words);
      if (uniqueWords.size < words.length * 0.2) {
        return true;
      }
    }
    
    return false;
  }
  
  static shouldBlock(content) {
    const violations = this.checkContent(content);
    return violations.length > 0;
  }
  
  static getViolationReason(content) {
    return this.checkContent(content);
  }
}

module.exports = ContentModeration;