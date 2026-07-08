import { normalizeLabel } from './derivation-contract';
import type { SavedLabel } from './vault-types';

export type LabelResult = {
  pin: string;
  label: string;
};

type LabelFlowState = {
  route: 'label';
  initialLabel: string;
  origin: 'manual' | 'vault';
  labelVersion: number;
};

type RevealFlowState = {
  route: 'reveal';
  result: LabelResult;
  origin: 'manual' | 'vault';
  labelVersion: number;
};

type PrimaryFlowState = LabelFlowState | RevealFlowState;

type VaultFlowState = {
  route: 'vault';
  returnState: PrimaryFlowState;
};

export type FlowState = PrimaryFlowState | VaultFlowState;

export type FlowAction =
  | { type: 'openVault' }
  | { type: 'closeVault' }
  | { type: 'selectVaultLabel'; label: SavedLabel }
  | { type: 'showReveal'; pin: string; label: string }
  | { type: 'exitReveal' }
  | { type: 'reset' };

export const initialFlowState: FlowState = {
  route: 'label',
  initialLabel: '',
  origin: 'manual',
  labelVersion: 0
};

export function labelCameFromVault(state: FlowState, label: string): boolean {
  if (state.route !== 'label') {
    return false;
  }

  return (
    state.origin === 'vault' &&
    state.initialLabel !== '' &&
    normalizeLabel(label) === normalizeLabel(state.initialLabel)
  );
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'openVault':
      if (state.route === 'vault') {
        return state;
      }

      return {
        route: 'vault',
        returnState: state
      };

    case 'closeVault':
      if (state.route !== 'vault') {
        return state;
      }

      return state.returnState;

    case 'selectVaultLabel':
      return {
        route: 'label',
        initialLabel: action.label.originalLabel,
        origin: 'vault',
        labelVersion:
          state.route === 'vault'
            ? state.returnState.labelVersion + 1
            : state.labelVersion + 1
      };

    case 'showReveal':
      if (state.route !== 'label') {
        return state;
      }

      return {
        route: 'reveal',
        result: { pin: action.pin, label: action.label },
        origin: labelCameFromVault(state, action.label) ? 'vault' : 'manual',
        labelVersion: state.labelVersion
      };

    case 'exitReveal':
      if (state.route !== 'reveal') {
        return state;
      }

      return {
        route: 'label',
        initialLabel: '',
        origin: 'manual',
        labelVersion: state.labelVersion
      };

    case 'reset':
      return initialFlowState;
  }
}
