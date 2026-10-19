import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MerchantOnboardingWizard } from "./MerchantOnboardingWizard";

// Mock dependencies
vi.mock("../../hooks/useWallet", () => ({
  useWallet: vi.fn(() => ({
    address: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7",
    isConnected: true,
    connect: vi.fn(),
    getNetwork: vi.fn(),
  })),
}));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: vi.fn(() => ({
    network: {
      id: "testnet",
      label: "Testnet",
      networkPassphrase: "Test SDF Network ; September 2015",
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    },
  })),
}));

vi.mock("../../lib/merchantRegistration", () => ({
  isValidContactEmail: (email: string) => email.includes("@"),
  isValidStoreSlug: (slug: string) => /^[a-z0-9-]+$/.test(slug),
  generateStoreSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
  validateDomainFormat: (domain: string) => domain.includes(".") && domain.length > 3,
  registerMerchant: vi.fn(() => Promise.resolve({ transactionHash: "tx123" })),
  loadOnboardingState: vi.fn(() => null),
  saveOnboardingState: vi.fn(),
  clearOnboardingState: vi.fn(),
}));

vi.mock("../../lib/merchantDomainVerification", () => ({
  verifyDomainOwnership: vi.fn(() =>
    Promise.resolve({ valid: true, signingKey: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7" })
  ),
}));

describe("MerchantOnboardingWizard", () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the wizard with all steps", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    expect(screen.getByText("Register your store")).toBeInTheDocument();
    expect(screen.getByText("Store Details")).toBeInTheDocument();
  });

  it("validates store details form", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Try to advance without filling required fields
    fireEvent.click(screen.getByText("Next"));
    
    // Should show validation errors
    expect(screen.getByText("Store name is required.")).toBeInTheDocument();
    expect(screen.getByText("Description is required.")).toBeInTheDocument();
    expect(screen.getByText("Store slug is required.")).toBeInTheDocument();
  });

  it("validates email format", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store name
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    
    // Invalid email
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "invalid-email" } });
    fireEvent.click(screen.getByText("Next"));
    
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("generates slug from store name", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Awesome Store" } });
    fireEvent.click(screen.getByText("Generate"));
    
    expect(screen.getByDisplayValue("my-awesomestore")).toBeInTheDocument();
  });

  it("validates payout address", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store details first
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    
    // Click Next to go to payout step
    fireEvent.click(screen.getByText("Next"));
    
    // Try to advance without payout address
    fireEvent.click(screen.getByText("Next"));
    
    expect(screen.getByText("Payout address is required.")).toBeInTheDocument();
  });

  it("verifies wallet ownership", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill store details
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    
    // Navigate to contract binding step
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    
    // Click verify wallet
    fireEvent.click(screen.getByText("Verify Wallet"));
    
    // Should show wallet verification
    await waitFor(() => {
      expect(screen.getByText(/Wallet verified/i)).toBeInTheDocument();
    });
  });

  it("validates domain verification", async () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill all steps up to verification
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    fireEvent.change(screen.getByDisplayValue(/payout address/i), { target: { value: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7" } });
    
    // Navigate to verification
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Verify Wallet"));
    fireEvent.click(screen.getByText("Next"));
    
    // Try to verify without domain
    fireEvent.click(screen.getByText("Verify Domain"));
    
    expect(screen.getByText("Domain name is required.")).toBeInTheDocument();
  });

  it("handles domain verification with matching key", async () => {
    const mockVerifyDomain = vi.fn(() =>
      Promise.resolve({ valid: true, signingKey: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7" })
    );
    
    vi.mock("../../lib/merchantDomainVerification", () => ({
      verifyDomainOwnership: mockVerifyDomain,
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill domain
    fireEvent.change(screen.getByLabelText(/domain name/i), { target: { value: "example.com" } });
    fireEvent.click(screen.getByText("Verify Domain"));
    
    await waitFor(() => {
      expect(mockVerifyDomain).toHaveBeenCalledWith("example.com", "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7");
      expect(screen.getByText(/Domain verified/i)).toBeInTheDocument();
    });
  });

  it("registers merchant on final step", async () => {
    const mockRegisterMerchant = vi.fn(() => Promise.resolve({ transactionHash: "tx123" }));
    
    vi.mock("../../lib/merchantRegistration", () => ({
      isValidContactEmail: (email: string) => email.includes("@"),
      isValidStoreSlug: (slug: string) => /^[a-z0-9-]+$/.test(slug),
      generateStoreSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
      validateDomainFormat: (domain: string) => domain.includes(".") && domain.length > 3,
      registerMerchant: mockRegisterMerchant,
      loadOnboardingState: vi.fn(() => null),
      saveOnboardingState: vi.fn(),
      clearOnboardingState: vi.fn(),
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill all fields and verify
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    fireEvent.change(screen.getByDisplayValue(/payout address/i), { target: { value: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7" } });
    fireEvent.change(screen.getByLabelText(/domain name/i), { target: { value: "example.com" } });
    
    // Navigate through all steps
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Verify Wallet"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Verify Domain"));
    
    await waitFor(() => {
      expect(screen.getByText(/Domain verified/i)).toBeInTheDocument();
    });
    
    // Click finish
    fireEvent.click(screen.getByText("Finish"));
    
    expect(mockRegisterMerchant).toHaveBeenCalled();
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", () => {
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.click(screen.getByText("Cancel"));
    
    expect(mockOnCancel).toHaveBeenCalled();
    expect(screen.getByText("Loading onboarding state...")).toBeInTheDocument();
  });

  it("handles wallet connection flow", async () => {
    vi.mock("../../hooks/useWallet", () => ({
      useWallet: vi.fn(() => ({
        address: null,
        isConnected: false,
        connect: vi.fn(),
        getNetwork: vi.fn(),
      })),
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Navigate to contract binding
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    
    // Should show "Connect Wallet" button
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("persists form data to localStorage", () => {
    const mockSave = vi.fn();
    vi.mock("../../lib/merchantRegistration", () => ({
      isValidContactEmail: (email: string) => email.includes("@"),
      isValidStoreSlug: (slug: string) => /^[a-z0-9-]+$/.test(slug),
      generateStoreSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
      validateDomainFormat: (domain: string) => domain.includes(".") && domain.length > 3,
      registerMerchant: vi.fn(() => Promise.resolve({ transactionHash: "tx123" })),
      loadOnboardingState: vi.fn(() => null),
      saveOnboardingState: mockSave,
      clearOnboardingState: vi.fn(),
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    
    // Should save after each change
    expect(mockSave).toHaveBeenCalled();
  });

  it("clears onboarding state when completed", async () => {
    const mockClear = vi.fn();
    vi.mock("../../lib/merchantRegistration", () => ({
      isValidContactEmail: (email: string) => email.includes("@"),
      isValidStoreSlug: (slug: string) => /^[a-z0-9-]+$/.test(slug),
      generateStoreSlug: (name: string) => name.toLowerCase().replace(/\s+/g, "-"),
      validateDomainFormat: (domain: string) => domain.includes(".") && domain.length > 3,
      registerMerchant: vi.fn(() => Promise.resolve({ transactionHash: "tx123" })),
      loadOnboardingState: vi.fn(() => null),
      saveOnboardingState: vi.fn(),
      clearOnboardingState: mockClear,
    }));
    
    render(<MerchantOnboardingWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);
    
    // Fill and navigate to complete
    fireEvent.change(screen.getByLabelText(/store name/i), { target: { value: "My Store" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A store" } });
    fireEvent.change(screen.getByLabelText(/contact email/i), { target: { value: "contact@store.com" } });
    fireEvent.change(screen.getByDisplayValue(/payout address/i), { target: { value: "GDORSZV4ZSCYH5XVJXV7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7X7" } });
    fireEvent.change(screen.getByLabelText(/domain name/i), { target: { value: "example.com" } });
    
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Verify Wallet"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Verify Domain"));
    
    await waitFor(() => {
      expect(screen.getByText(/Domain verified/i)).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByText("Finish"));
    
    expect(mockClear).toHaveBeenCalled();
  });
});