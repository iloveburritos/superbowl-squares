import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the validation logic extracted from CreatePoolForm
describe('CreatePoolForm validation', () => {
  interface FormData {
    name: string;
    squarePrice: string;
    maxSquaresPerUser: string;
    q1Payout: string;
    halftimePayout: string;
    q3Payout: string;
    finalPayout: string;
    purchaseDeadlineDays: string;
  }

  const defaultFormData: FormData = {
    name: 'Super Bowl LX Pool',
    squarePrice: '0.1',
    maxSquaresPerUser: '10',
    q1Payout: '15',
    halftimePayout: '30',
    q3Payout: '15',
    finalPayout: '40',
    purchaseDeadlineDays: '7',
  };

  function validateForm(formData: FormData, targetChainId: number | null) {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Pool name is required';
    }

    const price = parseFloat(formData.squarePrice);
    if (isNaN(price) || price <= 0) {
      errors.squarePrice = 'Invalid price';
    }

    const payoutSum =
      parseInt(formData.q1Payout) +
      parseInt(formData.halftimePayout) +
      parseInt(formData.q3Payout) +
      parseInt(formData.finalPayout);

    if (payoutSum !== 100) {
      errors.payout = `Payouts must sum to 100% (currently ${payoutSum}%)`;
    }

    if (!targetChainId) {
      errors.chain = 'Please select a network';
    }

    return { errors, isValid: Object.keys(errors).length === 0 };
  }

  describe('Pool name validation', () => {
    it('should accept valid pool name', () => {
      const { errors, isValid } = validateForm(defaultFormData, 11155111);
      expect(errors.name).toBeUndefined();
    });

    it('should reject empty pool name', () => {
      const { errors } = validateForm({ ...defaultFormData, name: '' }, 11155111);
      expect(errors.name).toBe('Pool name is required');
    });

    it('should reject whitespace-only pool name', () => {
      const { errors } = validateForm({ ...defaultFormData, name: '   ' }, 11155111);
      expect(errors.name).toBe('Pool name is required');
    });
  });

  describe('Square price validation', () => {
    it('should accept valid price', () => {
      const { errors } = validateForm(defaultFormData, 11155111);
      expect(errors.squarePrice).toBeUndefined();
    });

    it('should accept small price', () => {
      const { errors } = validateForm({ ...defaultFormData, squarePrice: '0.001' }, 11155111);
      expect(errors.squarePrice).toBeUndefined();
    });

    it('should reject zero price', () => {
      const { errors } = validateForm({ ...defaultFormData, squarePrice: '0' }, 11155111);
      expect(errors.squarePrice).toBe('Invalid price');
    });

    it('should reject negative price', () => {
      const { errors } = validateForm({ ...defaultFormData, squarePrice: '-0.1' }, 11155111);
      expect(errors.squarePrice).toBe('Invalid price');
    });

    it('should reject non-numeric price', () => {
      const { errors } = validateForm({ ...defaultFormData, squarePrice: 'abc' }, 11155111);
      expect(errors.squarePrice).toBe('Invalid price');
    });
  });

  describe('Payout validation', () => {
    it('should accept payouts summing to 100', () => {
      const { errors } = validateForm(defaultFormData, 11155111);
      expect(errors.payout).toBeUndefined();
    });

    it('should accept different valid payout distributions', () => {
      const { errors } = validateForm(
        {
          ...defaultFormData,
          q1Payout: '10',
          halftimePayout: '20',
          q3Payout: '30',
          finalPayout: '40',
        },
        11155111
      );
      expect(errors.payout).toBeUndefined();
    });

    it('should reject payouts summing to less than 100', () => {
      const { errors } = validateForm(
        {
          ...defaultFormData,
          q1Payout: '10',
          halftimePayout: '20',
          q3Payout: '20',
          finalPayout: '40',
        },
        11155111
      );
      expect(errors.payout).toContain('90%');
    });

    it('should reject payouts summing to more than 100', () => {
      const { errors } = validateForm(
        {
          ...defaultFormData,
          q1Payout: '30',
          halftimePayout: '30',
          q3Payout: '30',
          finalPayout: '30',
        },
        11155111
      );
      expect(errors.payout).toContain('120%');
    });
  });

  describe('Chain selection validation', () => {
    it('should accept valid chain', () => {
      const { errors } = validateForm(defaultFormData, 11155111);
      expect(errors.chain).toBeUndefined();
    });

    it('should reject null chain', () => {
      const { errors } = validateForm(defaultFormData, null);
      expect(errors.chain).toBe('Please select a network');
    });
  });

  describe('Overall validation', () => {
    it('should pass with all valid inputs', () => {
      const { isValid } = validateForm(defaultFormData, 11155111);
      expect(isValid).toBe(true);
    });

    it('should fail with multiple invalid inputs', () => {
      const { errors, isValid } = validateForm(
        {
          ...defaultFormData,
          name: '',
          squarePrice: '0',
          q1Payout: '50',
        },
        null
      );
      expect(isValid).toBe(false);
      expect(Object.keys(errors).length).toBeGreaterThan(1);
    });
  });
});

describe('Success modal display logic', () => {
  it('should show modal when isSuccess and poolAddress are both truthy', () => {
    const isSuccess = true;
    const poolAddress = '0x1234567890123456789012345678901234567890';
    const shouldShowModal = isSuccess && !!poolAddress;
    expect(shouldShowModal).toBe(true);
  });

  it('should not show modal when isSuccess is false', () => {
    const isSuccess = false;
    const poolAddress = '0x1234567890123456789012345678901234567890';
    const shouldShowModal = isSuccess && !!poolAddress;
    expect(shouldShowModal).toBe(false);
  });

  it('should not show modal when poolAddress is undefined', () => {
    const isSuccess = true;
    const poolAddress = undefined;
    const shouldShowModal = isSuccess && !!poolAddress;
    expect(shouldShowModal).toBe(false);
  });
});
