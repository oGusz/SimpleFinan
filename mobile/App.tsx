import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

const BACKGROUND = '#0d1117';
const NEXT_PORT = 3000;
const SUPABASE_AUTHORIZE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/auth\/v1\/authorize\?/i;

// O Metro e o Next rodam no mesmo computador, então o IP do Metro também serve para o Next.
function getWebUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:${NEXT_PORT}` : null;
}

const WEB_URL = getWebUrl();

// O genérico padrão da react-native-webview 14 (undefined) transforma as props em `never`.
const SimpleFinanWebView = WebView<object>;

function Message({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <View style={styles.message}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Tentar novamente</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function App() {
  const webView = useRef<WebView<object>>(null);

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
        const reason = params?.error_description ?? params?.error ?? 'O provedor não devolveu um código.';
        Alert.alert('Falha no login social', String(reason));
      }
    } catch (error) {
      Alert.alert('Falha no login social', String(error));
    }
    webView.current?.reload();
  }

  // Só as páginas do SimpleFinan abrem no app. Links externos vão para o Safari;
  // iframes, como o da Pluggy, seguem carregando dentro da página.
  function handleNavigation(request: ShouldStartLoadRequest) {
    if (!request.isTopFrame || request.url.startsWith(`${WEB_URL}/`) || request.url === WEB_URL) {
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        {WEB_URL ? (
          <SimpleFinanWebView
            ref={webView}
            source={{ uri: WEB_URL }}
            style={styles.container}
            sharedCookiesEnabled
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
            onShouldStartLoadWithRequest={handleNavigation}
            renderError={() => (
              <View style={StyleSheet.absoluteFill}>
                <Message
                  title="Não consegui abrir o SimpleFinan"
                  detail={`Confira se o "npm run dev:mobile" está rodando e se ${WEB_URL} abre no Safari do iPhone.`}
                  onRetry={() => webView.current?.reload()}
                />
              </View>
            )}
          />
        ) : (
          <Message
            title="Endereço do servidor não encontrado"
            detail="Defina EXPO_PUBLIC_WEB_URL em mobile/.env e reinicie o Expo."
          />
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
