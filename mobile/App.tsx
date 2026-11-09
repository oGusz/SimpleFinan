import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import type { NotificationResponse } from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewMessageEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';

const BACKGROUND = '#0d1117';
const EMERALD = '#10b981';
const NEXT_PORT = 3000;
const SUPABASE_AUTHORIZE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/auth\/v1\/authorize\?/i;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIOMETRIC_REQUEST_ID = /^[\w-]{1,64}$/;
const INTERNAL_PATH = /^\/(?!\/)[^\\]*$/;
const EXIT_PATHS = new Set(['/', '/login']);
const BACK_RESPONSE_TIMEOUT_MS = 400;
const GO_BACK_CHECK_MS = 700;
const PUSH_SYNC_DELAY_MS = 3000;
const CONNECTION_ERROR = 'Sem conexão. Verifique sua internet e tente de novo.';
const GENERIC_ERROR = 'Não foi possível concluir. Tente novamente.';
const IAP_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// O Metro e o Next rodam no mesmo computador, então o IP do Metro também serve para o Next.
function getWebUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (!__DEV__) return null;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:${NEXT_PORT}` : null;
}

const WEB_URL = getWebUrl();

// Compara com o separador: "https://app.com.site-falso.net" também começa com "https://app.com".
function isAppUrl(url: string) {
  return (
    url === WEB_URL ||
    url.startsWith(`${WEB_URL}/`) ||
    url.startsWith(`${WEB_URL}?`) ||
    url.startsWith(`${WEB_URL}#`)
  );
}

function pathOf(url: string) {
  const path = url.slice(WEB_URL?.length ?? 0);
  return path.startsWith('/') ? path : `/${path}`;
}

function routeOf(path: string) {
  const route = path.replace(/[?#].*$/, '');
  return route.length > 1 ? route.replace(/\/$/, '') : route;
}

// O Next navega por pushState, que nem sempre aciona onNavigationStateChange.
const HISTORY_SCRIPT = `(function () {
  if (window.__SIMPLEFINAN_HISTORY__) return;
  window.__SIMPLEFINAN_HISTORY__ = true;
  function report() {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'history',
        path: location.pathname + location.search + location.hash,
      }));
    } catch (error) {}
  }
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      report();
      return result;
    };
  });
  window.addEventListener('popstate', report);
})();`;

function buildInjectedScript(biometric: boolean) {
  const native = JSON.stringify({
    platform: Platform.OS,
    biometric,
    version: Constants.expoConfig?.version ?? null,
  });
  return `window.__SIMPLEFINAN_IAP__ = ${Boolean(IAP_API_KEY)};
window.__SIMPLEFINAN_NATIVE__ = ${native};
${HISTORY_SCRIPT}
true;`;
}

// O Expo Go não tem push remoto no Android e reclama só de importar o módulo.
async function loadNotifications() {
  return IS_EXPO_GO ? null : import('expo-notifications');
}

async function getPushToken(askPermission: boolean): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  // No Android 13 ou mais novo, o pedido de permissão só aparece depois que existe um canal.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lembretes de contas',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted && askPermission) {
    ({ granted } = await Notifications.requestPermissionsAsync());
  }
  if (!granted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

// O genérico padrão da react-native-webview 14 (undefined) transforma as props em `never`.
const SimpleFinanWebView = WebView<object>;

function Message({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <View style={styles.message}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.detail}>{detail}</Text>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>Tentar novamente</Text>
        </Pressable>
      )}
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.loading]}>
      <Image source={require('./assets/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
      <ActivityIndicator color={EMERALD} size="large" accessibilityLabel="Carregando" />
    </View>
  );
}

type WebRequest = {
  type?: unknown;
  userId?: unknown;
  packageId?: unknown;
  requestId?: unknown;
  path?: unknown;
  closed?: unknown;
};

export default function App() {
  const webView = useRef<WebView<object>>(null);
  const [biometric, setBiometric] = useState<boolean | null>(null);
  const [serverFailed, setServerFailed] = useState(false);
  // No Android, a WebView cujo processo morreu não pode ser reaproveitada: é preciso montar outra.
  const [instance, setInstance] = useState({ key: 0, uri: WEB_URL ?? '' });

  const currentPath = useRef('/');
  const loadFailed = useRef(false);
  const serverFailedRef = useRef(false);
  const pageReady = useRef(false);
  const pendingPath = useRef<string | null>(null);
  const handledNotifications = useRef(new Set<string>());
  const pendingBack = useRef<{ id: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const backCounter = useRef(0);
  const goBackCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushSync = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dispatchToPage(name: string, detail?: unknown) {
    const init = detail === undefined ? '{}' : `{ detail: ${JSON.stringify(detail)} }`;
    webView.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('${name}', ${init})); true;`);
  }

  function navigateTo(path: string) {
    const target = JSON.stringify(`${WEB_URL}${path}`);
    webView.current?.injectJavaScript(`window.location.assign(${target}); true;`);
  }

  function setServerFailure(failed: boolean) {
    serverFailedRef.current = failed;
    setServerFailed(failed);
  }

  function retry() {
    loadFailed.current = false;
    setServerFailure(false);
    webView.current?.reload();
  }

  async function sendPushToken(askPermission: boolean) {
    try {
      const token = await getPushToken(askPermission);
      if (token) dispatchToPage('simplefinan:push-token', { token, platform: Platform.OS });
    } catch (error) {
      if (__DEV__) console.warn('Não foi possível obter o token de notificações.', error);
    }
  }

  function updatePath(path: string) {
    const leftLogin = routeOf(currentPath.current) === '/login' && routeOf(path) !== '/login';
    currentPath.current = path;
    if (!leftLogin) return;

    // O aparelho pode ter trocado de conta: o token precisa passar para quem acabou de entrar.
    // A espera dá tempo de a página nova montar o componente que recebe o evento.
    if (pushSync.current) clearTimeout(pushSync.current);
    pushSync.current = setTimeout(() => sendPushToken(false), PUSH_SYNC_DELAY_MS);
  }

  function handleNavigationState(state: WebViewNavigation) {
    if (isAppUrl(state.url)) updatePath(pathOf(state.url));
  }

  function finishBack(modalClosed: boolean) {
    if (pendingBack.current) clearTimeout(pendingBack.current.timer);
    pendingBack.current = null;
    if (modalClosed) return;

    if (EXIT_PATHS.has(routeOf(currentPath.current))) {
      BackHandler.exitApp();
      return;
    }

    const before = currentPath.current;
    webView.current?.goBack();
    // Sem histórico (tela aberta por notificação ou recarregada), o goBack não faz nada.
    goBackCheck.current = setTimeout(() => {
      if (currentPath.current === before) {
        webView.current?.injectJavaScript(`window.location.replace(${JSON.stringify(`${WEB_URL}/`)}); true;`);
      }
    }, GO_BACK_CHECK_MS);
  }

  // Só a página sabe se há um modal aberto, e o BackHandler precisa responder na hora.
  // Por isso o toque é sempre consumido aqui, e a decisão sai quando a página responder.
  function handleHardwareBack() {
    if (!webView.current || loadFailed.current || serverFailedRef.current) return false;
    if (pendingBack.current) return true;
    if (goBackCheck.current) clearTimeout(goBackCheck.current);

    const id = ++backCounter.current;
    pendingBack.current = { id, timer: setTimeout(() => finishBack(false), BACK_RESPONSE_TIMEOUT_MS) };
    webView.current.injectJavaScript(`(function () {
      var event = new CustomEvent('simplefinan:back', { cancelable: true });
      var notCancelled = window.dispatchEvent(event);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'back-result',
        requestId: ${id},
        closed: !notCancelled,
      }));
    })(); true;`);
    return true;
  }

  const handleBackRef = useRef(handleHardwareBack);
  const retryRef = useRef(retry);
  const openFromNotificationRef = useRef<(response: NotificationResponse) => void>(() => {});
  useEffect(() => {
    handleBackRef.current = handleHardwareBack;
    retryRef.current = retry;
    openFromNotificationRef.current = openFromNotification;
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handleBackRef.current());
    return () => subscription.remove();
  }, []);

  // O valor precisa estar pronto antes da página carregar, pois é injetado antes do conteúdo.
  useEffect(() => {
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hasHardware, isEnrolled]) => setBiometric(hasHardware && isEnrolled))
      .catch(() => setBiometric(false));
  }, []);

  // renderError só cobre a falha em si: sem isto, a pessoa teria de tocar no botão ao voltar a internet.
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false && loadFailed.current) {
          retryRef.current();
        }
      }),
    [],
  );

  function openFromNotification(response: NotificationResponse) {
    const identifier = response.notification.request.identifier;
    if (handledNotifications.current.has(identifier)) return;
    handledNotifications.current.add(identifier);

    const path = response.notification.request.content.data?.url;
    if (typeof path !== 'string' || !INTERNAL_PATH.test(path)) return;
    if (pageReady.current) {
      if (path !== currentPath.current) navigateTo(path);
    } else {
      pendingPath.current = path;
    }
  }

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | undefined;

    async function listen() {
      const Notifications = await loadNotifications();
      if (!Notifications || !active) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      const openIfTapped = (response: NotificationResponse) => {
        if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          openFromNotificationRef.current(response);
        }
        // Sem limpar, o sistema entrega o mesmo toque de novo na próxima abertura.
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      };

      subscription = Notifications.addNotificationResponseReceivedListener(openIfTapped);
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && active) openIfTapped(last);
    }

    listen().catch((error) => {
      if (__DEV__) console.warn('Não foi possível preparar as notificações.', error);
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  function handleLoadEnd() {
    pageReady.current = true;
    const path = pendingPath.current;
    pendingPath.current = null;
    if (path && path !== currentPath.current) navigateTo(path);
  }

  function showLoginError(detail: string) {
    Alert.alert('Não foi possível entrar. Tente novamente.', __DEV__ ? detail : undefined);
  }

  // O Google não aceita login em WebView, então ele acontece na sessão segura do iOS.
  // O código volta para a WebView, que guarda o cookie necessário para criar a sessão.
  async function signInWithBrowser(authorizeUrl: string) {
    const returnUrl = Linking.createURL('auth/callback');
    const url = authorizeUrl.replace(
      /([?&]redirect_to=)[^&]*/,
      (_, prefix: string) => `${prefix}${encodeURIComponent(returnUrl)}`,
    );

    try {
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      if (result.type === 'success') {
        const params = Linking.parse(result.url).queryParams;
        if (typeof params?.code === 'string') {
          const callback = `${WEB_URL}/auth/callback?code=${encodeURIComponent(params.code)}`;
          webView.current?.injectJavaScript(`window.location.replace(${JSON.stringify(callback)}); true;`);
          return;
        }
        showLoginError(String(params?.error_description ?? params?.error ?? 'O provedor não devolveu um código.'));
      }
    } catch (error) {
      showLoginError(String(error));
    }
    webView.current?.reload();
  }

  function sendPurchaseResult(
    status: 'success' | 'restored' | 'nothing_to_restore' | 'cancelled' | 'error',
    message?: string,
  ) {
    dispatchToPage('simplefinan:iap', { status, message });
  }

  // A página pede a compra; só o app nativo fala com a loja. O Premium é liberado
  // pelo webhook da RevenueCat, e não por esta tela.
  async function handleStoreRequest(request: WebRequest) {
    const isOfferings = request.type === 'offerings';
    const fail = (message: string) => {
      if (isOfferings) dispatchToPage('simplefinan:offerings', { status: 'error', packages: [] });
      else sendPurchaseResult('error', message);
    };

    if (!IAP_API_KEY) {
      fail('A assinatura não está disponível neste aparelho.');
      return;
    }
    if (typeof request.userId !== 'string' || !USER_ID.test(request.userId)) {
      fail('Entre na sua conta e tente de novo.');
      return;
    }

    try {
      // Import tardio: sem chave configurada, o Expo Go nem carrega este módulo.
      const { default: Purchases } = await import('react-native-purchases');
      if (await Purchases.isConfigured()) {
        await Purchases.logIn(request.userId);
      } else {
        Purchases.configure({ apiKey: IAP_API_KEY, appUserID: request.userId });
      }

      if (request.type === 'offerings') {
        const offerings = await Purchases.getOfferings();
        const packages = (offerings.current?.availablePackages ?? []).map((item) => ({
          identifier: item.identifier,
          title: item.product.title,
          priceString: item.product.priceString,
          period: item.product.subscriptionPeriod ?? '',
          introPrice: item.product.introPrice?.priceString,
          introPeriod: item.product.introPrice?.period,
          introCycles: item.product.introPrice?.cycles,
        }));
        dispatchToPage('simplefinan:offerings', { status: packages.length > 0 ? 'ok' : 'empty', packages });
      } else if (request.type === 'restore') {
        const customerInfo = await Purchases.restorePurchases();
        if (Object.keys(customerInfo.entitlements.active).length > 0) {
          sendPurchaseResult('restored');
        } else {
          sendPurchaseResult('nothing_to_restore', 'Nenhuma assinatura encontrada nesta conta da loja.');
        }
      } else {
        if (typeof request.packageId !== 'string' || !request.packageId) {
          fail('Escolha um plano para continuar.');
          return;
        }
        const offerings = await Purchases.getOfferings();
        const selected = offerings.current?.availablePackages.find((item) => item.identifier === request.packageId);
        if (!selected) {
          fail('Este plano não está mais disponível. Atualize a tela e tente de novo.');
          return;
        }
        const { customerInfo } = await Purchases.purchasePackage(selected);
        if (Object.keys(customerInfo.entitlements.active).length > 0) {
          sendPurchaseResult('success');
        } else {
          fail('A loja não confirmou a assinatura. Se houve cobrança, toque em Restaurar compras.');
        }
      }
    } catch (error) {
      if (!isOfferings && (error as { userCancelled?: boolean }).userCancelled) {
        sendPurchaseResult('cancelled');
      } else {
        fail(__DEV__ ? String(error) : GENERIC_ERROR);
      }
    }
  }

  async function handleBiometricRequest(requestId: string) {
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        dispatchToPage('simplefinan:biometric', { requestId, success: false, available: false });
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear o SimpleFinan',
        cancelLabel: 'Cancelar',
      });
      dispatchToPage('simplefinan:biometric', { requestId, success: result.success, available: true });
    } catch {
      // Falha nunca destrava: a biometria segue disponível e a pessoa pode tentar de novo.
      dispatchToPage('simplefinan:biometric', { requestId, success: false, available: true });
    }
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    if (!isAppUrl(event.nativeEvent.url)) return;

    let request: WebRequest | null;
    try {
      request = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!request || typeof request !== 'object') return;

    switch (request.type) {
      case 'history':
        if (typeof request.path === 'string' && INTERNAL_PATH.test(request.path)) updatePath(request.path);
        break;
      case 'back-result':
        if (pendingBack.current?.id === request.requestId) finishBack(request.closed === true);
        break;
      case 'offerings':
      case 'purchase':
      case 'restore':
        void handleStoreRequest(request);
        break;
      case 'biometric-auth':
        if (typeof request.requestId === 'string' && BIOMETRIC_REQUEST_ID.test(request.requestId)) {
          void handleBiometricRequest(request.requestId);
        }
        break;
      case 'push-register':
        void sendPushToken(true);
        break;
      case 'push-sync':
        void sendPushToken(false);
        break;
      case 'haptic':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
    }
  }

  // Só as páginas do SimpleFinan abrem no app. Links externos vão para o Safari;
  // iframes, como o da Pluggy, seguem carregando dentro da página.
  function handleNavigation(request: ShouldStartLoadRequest) {
    if (!request.isTopFrame || isAppUrl(request.url)) {
      return true;
    }
    if (SUPABASE_AUTHORIZE.test(request.url)) {
      signInWithBrowser(request.url);
      return false;
    }
    if (/^(https?|mailto|tel):/i.test(request.url)) {
      Linking.openURL(request.url).catch(() => {});
    }
    return false;
  }

  // A autorização no banco (OAuth da Pluggy) abre em nova janela, que a WebView descartaria sem isto.
  // O widget continua na página e acompanha o resultado; a pessoa só precisa voltar ao app.
  function handleOpenWindow({ nativeEvent }: WebViewOpenWindowEvent) {
    const url = nativeEvent.targetUrl;
    if (isAppUrl(url)) {
      webView.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
    } else if (/^https:/i.test(url)) {
      WebBrowser.openBrowserAsync(url).catch(() => {
        Linking.openURL(url).catch(() => {});
      });
    } else if (/^(mailto|tel):/i.test(url)) {
      Linking.openURL(url).catch(() => {});
    }
  }

  function restartAfterCrash() {
    setInstance((previous) => ({ key: previous.key + 1, uri: `${WEB_URL}${currentPath.current}` }));
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        {!WEB_URL ? (
          <Message
            title={__DEV__ ? 'Endereço do servidor não encontrado' : 'Não foi possível abrir o SimpleFinan'}
            detail={
              __DEV__
                ? 'Defina EXPO_PUBLIC_WEB_URL em mobile/.env e reinicie o Expo.'
                : 'Atualize o app pela loja. Se continuar, fale com o suporte.'
            }
          />
        ) : biometric === null ? (
          <LoadingScreen />
        ) : (
          <View style={styles.container}>
            <SimpleFinanWebView
              key={instance.key}
              ref={webView}
              source={{ uri: instance.uri }}
              style={styles.container}
              sharedCookiesEnabled
              allowsBackForwardNavigationGestures
              pullToRefreshEnabled
              startInLoadingState
              renderLoading={() => <LoadingScreen />}
              onShouldStartLoadWithRequest={handleNavigation}
              onOpenWindow={handleOpenWindow}
              javaScriptCanOpenWindowsAutomatically
              onNavigationStateChange={handleNavigationState}
              onMessage={handleWebMessage}
              onLoadStart={() => {
                loadFailed.current = false;
              }}
              onLoadEnd={handleLoadEnd}
              onError={() => {
                loadFailed.current = true;
              }}
              onHttpError={({ nativeEvent }) => {
                if (nativeEvent.statusCode >= 500 && isAppUrl(nativeEvent.url)) setServerFailure(true);
              }}
              onContentProcessDidTerminate={() => webView.current?.reload()}
              onRenderProcessGone={restartAfterCrash}
              injectedJavaScriptBeforeContentLoaded={buildInjectedScript(biometric)}
              renderError={(_domain, code, description) => (
                <View style={StyleSheet.absoluteFill}>
                  <Message
                    title="Não foi possível abrir o SimpleFinan"
                    detail={__DEV__ ? `${WEB_URL}: ${description} (${code})` : CONNECTION_ERROR}
                    onRetry={retry}
                  />
                </View>
              )}
            />
            {serverFailed && (
              <View style={StyleSheet.absoluteFill}>
                <Message
                  title="O SimpleFinan está fora do ar"
                  detail="Tente de novo em alguns instantes."
                  onRetry={retry}
                />
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: BACKGROUND,
  },
  logo: {
    width: 96,
    height: 96,
  },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: BACKGROUND,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  buttonText: {
    color: BACKGROUND,
    fontWeight: '600',
  },
});
