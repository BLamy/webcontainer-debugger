import { describe, it, expect, beforeEach } from 'vitest';
import { 
  calculateDeloreanSpeed, 
  isTimeTravelReady,
  fluxCapacitorStatus, 
  formatDestination 
} from './utils.js';

describe('Time Travel Utilities', () => {
  describe('calculateDeloreanSpeed', () => {
    it('correctly adds acceleration to current speed', () => {
      expect(calculateDeloreanSpeed(35, 10)).toBe(45);
    });
    
    it('reaches 88mph with proper acceleration', () => {
      const initialSpeed = 58;
      const acceleration = 30;
      const newSpeed = calculateDeloreanSpeed(initialSpeed, acceleration);
      expect(newSpeed).toBe(88);
    });
  });
  
  describe('isTimeTravelReady', () => {
    it('returns false when speed is below 88mph', () => {
      expect(isTimeTravelReady(87)).toBe(false);
    });
    
    it('returns true when speed is at least 88mph', () => {
      expect(isTimeTravelReady(88)).toBe(true);
      expect(isTimeTravelReady(90)).toBe(true);
    });
  });
  
  describe('fluxCapacitorStatus', () => {
    it('reports insufficient power when below 1.21 gigawatts', () => {
      expect(fluxCapacitorStatus(1.2)).toBe('insufficient power');
    });
    
    it('is ready for time travel at 1.21 gigawatts or more', () => {
      expect(fluxCapacitorStatus(1.21)).toBe('ready for time travel');
      expect(fluxCapacitorStatus(1.5)).toBe('ready for time travel');
    });
  });
  
  describe('formatDestination', () => {
    it('formats the date with proper zero padding', () => {
      expect(formatDestination(1985, 10, 26)).toBe('1985-10-26');
      expect(formatDestination(1955, 11, 5)).toBe('1955-11-05');
      expect(formatDestination(2015, 10, 21)).toBe('2015-10-21');
    });
  });
});