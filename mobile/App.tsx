import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

// Bundles the shared map logic so every build proves Metro resolves ../src.
import './src/shared';

// Blank until the sign-in and map screens are chosen in #223.
export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
