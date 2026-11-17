let mockState;
let mockFocused;
const mockDispatch = jest.fn();
const mockNavigation = {setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn()};

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: selector => selector(mockState),
}));
jest.mock('../../../hooks/useObjectSelector', () => ({
  useObjectSelector: selector => selector(mockState),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({}),
  useIsFocused: () => mockFocused,
}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({bottom: 0})}));
jest.mock('react-native-paper', () => {
  const Portal = ({children}) => children;
  Portal.Host = 'PortalHost';
  return {Portal, Text: 'Text', Button: 'Button'};
});
jest.mock('react-native-svg', () => ({
  __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient',
  Stop: 'Stop', Rect: 'Rect',
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../../../containers/Coin/Overview/Overview', () => 'Overview');
jest.mock('../../../containers/Coin/DynamicHeader', () => 'DynamicHeader');
jest.mock('../../../containers/SubWalletSelect/SubWalletSelectorModal', () => 'SubWalletSelectorModal');
jest.mock('../../../components/MissingInfoRedirect/MissingInfoRedirect', () => 'MissingInfoRedirect');
jest.mock('../../../components/SemiModal', () => 'SemiModal');
jest.mock('../../../components/GradientButton', () => 'GradientButton');
jest.mock('../../CoinData/Graphics', () => ({RenderSquareCoinLogo: () => null}));
jest.mock('../../ledger/extractLedgerData', () => ({extractLedgerData: () => ({})}));
jest.mock('../../../actions/actionCreators', () => ({
  setCoinSubWallet: (chainTicker, subWallet) => ({type: 'select-wallet', chainTicker, subWallet}),
  setIsCoinMenuFocused: isFocused => ({type: 'coin-focus', isFocused}),
}));

const React = require('react');
const {act, create} = require('react-test-renderer');
const CoinMenus = require('../../../containers/Coin/CoinMenus').default;
const {WALLET_APP_OVERVIEW} = require('../../constants/apps');
const wallet = (id, compatible_apps = [WALLET_APP_OVERVIEW]) => ({id, name: id, compatible_apps});
const main = wallet('MAIN_WALLET');
const identity = wallet('transferred@');

describe('coin menu wallet chooser lifecycle', () => {
  let view;
  const render = () => act(() => {view = create(<CoinMenus />);});
  const update = () => act(() => view.update(<CoinMenus />));
  const options = () => view.root.findByType('SubWalletSelectorModal').props.subWallets;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockState = {
      authentication: {activeAccount: {accountHash: 'alice'}},
      coins: {activeCoin: {id: 'VRSC', display_ticker: 'VRSC', display_name: 'Verus'}, showBalance: true},
      coinMenus: {activeSubWallets: {VRSC: null}, allSubWallets: {VRSC: [main, identity]}},
      services: {},
    };
    mockDispatch.mockImplementation(action => {
      if (action.type === 'select-wallet') {
        mockState.coinMenus.activeSubWallets[action.chainTicker] = action.subWallet;
      }
    });
  });

  afterEach(() => {
    if (view) act(() => view.unmount());
    view = null;
  });

  it('updates the chooser when identities are unlinked, refreshed or added', () => {
    render();
    expect(options()).toEqual([main, identity]);
    mockState.coinMenus.allSubWallets.VRSC = [main];
    update();
    expect(options()).toEqual([main]);
    const updated = {...identity, name: 'Updated'};
    const linked = wallet('new@');
    mockState.coinMenus.allSubWallets.VRSC = [main, updated, linked];
    update();
    expect(options()).toEqual([main, updated, linked]);
  });

  it('hides the chooser while the screen is unfocused and restores it on focus', () => {
    render();
    mockFocused = false;
    update();
    expect(view.root.findAllByType('SubWalletSelectorModal')).toHaveLength(0);
    mockFocused = true;
    update();
    expect(options()).toEqual([main, identity]);
  });

  it('does not present a chooser or select an old wallet during logout', () => {
    mockState.authentication.activeAccount = null;
    mockState.coinMenus.allSubWallets.VRSC = [identity];
    render();
    expect(view.root.findAllByType('SubWalletSelectorModal')).toHaveLength(0);
    expect(mockDispatch.mock.calls.map(([action]) => action.type)).not.toContain('select-wallet');
  });

  it('does not show an empty chooser and restores it when wallets return', () => {
    render();
    mockState.coinMenus.allSubWallets.VRSC = [];
    update();
    expect(view.root.findAllByType('SubWalletSelectorModal')).toHaveLength(0);
    mockState.coinMenus.allSubWallets.VRSC = [main];
    update();
    expect(options()).toEqual([main]);
  });

  it('updates the compatibility filter and falls back when the last compatible wallet disappears', () => {
    const incompatible = wallet('view-only', []);
    mockState.coinMenus.activeSubWallets.VRSC = incompatible;
    mockState.coinMenus.allSubWallets.VRSC = [incompatible, identity];
    render();
    act(() => view.root.findByType('MissingInfoRedirect').props.onPress());
    expect(options()).toEqual([identity]);
    const linked = wallet('new@');
    mockState.coinMenus.allSubWallets.VRSC = [incompatible, linked];
    update();
    expect(options()).toEqual([linked]);
    mockState.coinMenus.allSubWallets.VRSC = [incompatible];
    update();
    expect(options()).toEqual([incompatible]);
  });
});
