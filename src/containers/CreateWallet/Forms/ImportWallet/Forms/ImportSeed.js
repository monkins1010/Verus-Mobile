/*
  Updated ImportSeed screen:
  - Top-aligned layout with left-aligned title (black) matching ChooseName.js
  - Row-based 24-slot card layout with tap-to-edit functionality
  - BIP39 word suggestions appear after 3 letters typed
  - Horizontal scrollable suggestion chips
  - Auto-advance to next empty slot after selecting suggestion
  - Primary button matches design system (#CFEAF2 when disabled)
  - 2026-01-26: Updated primary button to GradientButton and input to use
    container-based focus state pattern matching Unlock.js.
*/
import {validateMnemonic, wordlists} from 'bip39';
import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Dimensions,
  Keyboard,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  ScrollView,
  TextInput as RNTextInput,
  StyleSheet,
} from 'react-native';
import {
  Text,
  Paragraph,
  TextInput,
  Chip,
  Card,
} from 'react-native-paper';
import Button from '../../../../../components/Button';
import {createAlert} from '../../../../../actions/actions/alert/dispatchers/alert';
import GradientButton from '../../../../../components/GradientButton';
import Colors from '../../../../../globals/colors';
import {SMALL_DEVICE_HEGHT} from '../../../../../utils/constants/constants';

export default function ImportSeed({
  setImportedSeed,
  importedSeed,
  onComplete,
}) {
  const {height} = Dimensions.get('window');

  const [currentWord, setCurrentWord] = useState('');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const wordlist = wordlists.EN;

  const [words, setWords] = useState(Array(24).fill(''));
  const [isValidMnemonic, setIsValidMnemonic] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const cardScrollViewRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      event => {
        setKeyboardOffset(event.endCoordinates.height);
      },
    );

    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardOffset(0),
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    if (importedSeed != null && importedSeed.length > 0) {
      const seedSplit = importedSeed.split(' ');
      const newWords = Array(24).fill('');
      
      for (let i = 0; i < Math.min(seedSplit.length, 24); i++) {
        if (wordlist.includes(seedSplit[i])) {
          newWords[i] = seedSplit[i];
        }
      }

      setWords(newWords);
      
      // Check if valid mnemonic
      const filledWords = newWords.filter(w => w !== '');
      if (filledWords.length === 24) {
        setIsValidMnemonic(validateMnemonic(newWords.join(' '), wordlist));
      } else {
        setIsValidMnemonic(false);
      }
    } else {
      setWords(Array(24).fill(''));
      setIsValidMnemonic(false);
    }
  }, [importedSeed]);

  useEffect(() => {
    setCurrentWord(words[currentWordIndex] || '');
  }, [currentWordIndex]);

  // Update suggestions when currentWord changes
  useEffect(() => {
    if (currentWord.length >= 3) {
      const cleanWord = currentWord.toLowerCase().trim();
      const matches = wordlist.filter(w => w.startsWith(cleanWord));
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }, [currentWord]);

  const handleImport = () => {
    const filledWords = words.filter(w => w !== '');
    
    if (filledWords.length === 0) {
      createAlert('Error', 'Please enter a mnemonic seed.');
    } else if (filledWords.length < 24) {
      createAlert('Error', 'Please enter all 24 words.');
    } else if (!validateMnemonic(words.join(' '), wordlist)) {
      createAlert('Error', 'Invalid mnemonic seed.');
    } else {
      onComplete();
    }
  };

  const addWord = word => {
    const cleanWord = word.replace(/\s/g, '').toLowerCase();
    const wordKey = cleanWord.slice(0, 4);
    const fullWord = wordlist.find(x => x.slice(0, 4) === wordKey);

    if (fullWord == null) {
      createAlert('Invalid word', `'${cleanWord}' is not a valid seed word.`);
      return;
    }

    const newWords = [...words];
    newWords[currentWordIndex] = fullWord;
    setWords(newWords);
    setImportedSeed(newWords.join(' '));

    // Auto-advance to next empty slot
    const nextEmptyIndex = newWords.findIndex((w, i) => i > currentWordIndex && w === '');
    if (nextEmptyIndex !== -1) {
      setCurrentWordIndex(nextEmptyIndex);
      scrollToRow(nextEmptyIndex);
    } else if (newWords.filter(w => w !== '').length < 24) {
      // If no empty slots after current, find first empty slot
      const firstEmptyIndex = newWords.findIndex(w => w === '');
      if (firstEmptyIndex !== -1) {
        setCurrentWordIndex(firstEmptyIndex);
        scrollToRow(firstEmptyIndex);
      }
    } else {
      // All slots filled
      Keyboard.dismiss();
    }

    setCurrentWord('');
    setSuggestions([]);
  };

  const selectSuggestion = word => {
    addWord(word);
  };

  const selectRow = index => {
    setCurrentWordIndex(index);
    scrollToRow(index);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const scrollToRow = index => {
    if (cardScrollViewRef.current) {
      // Scroll to approximate position (40px per row)
      cardScrollViewRef.current.scrollTo({y: index * 40, animated: true});
    }
  };

  const getNextEmptySlotIndex = () => {
    const index = words.findIndex(w => w === '');
    return index === -1 ? 23 : index;
  };

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: Colors.secondaryColor}}>
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.secondaryColor,
          paddingHorizontal: 24,
          paddingTop: height < SMALL_DEVICE_HEGHT ? 40 : 60,
        }}>
        {/* Title - top-aligned, left-aligned, black */}
        <Text
          style={{
            textAlign: 'left',
            color: '#1A1A1A',
            fontSize: 32,
            fontWeight: '700',
            letterSpacing: -0.5,
            marginBottom: 12,
          }}>
          {'Import 24-word seed'}
        </Text>

        {/* Subtitle - left-aligned, improved typography */}
        <Text
          style={{
            textAlign: 'left',
            fontSize: 16,
            lineHeight: 22,
            color: '#555',
            marginBottom: 24,
          }}>
          {'Tap a slot to enter or edit that word.'}
        </Text>

        {/* 24-row card */}
        <Card
          mode="outlined"
          style={{
            borderRadius: 12,
            backgroundColor: '#FAFAFA',
            borderWidth: 1,
            borderColor: '#E0E0E0',
            marginBottom: 16,
            height: keyboardOffset !== 0 ? 200 : 320,
          }}>
          <ScrollView
            ref={cardScrollViewRef}
            contentContainerStyle={{padding: 8}}>
            {words.map((word, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => selectRow(index)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  marginBottom: 4,
                  backgroundColor:
                    currentWordIndex === index
                      ? Colors.primaryColor + '15'
                      : 'transparent',
                  borderWidth: currentWordIndex === index ? 1 : 0,
                  borderColor:
                    currentWordIndex === index ? Colors.primaryColor : 'transparent',
                }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: '#888',
                    width: 32,
                  }}>
                  {`${index + 1}.`}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: word ? '600' : '400',
                    color: word ? '#1A1A1A' : '#CCC',
                    flex: 1,
                  }}>
                  {word || 'Tap to add'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Card>

        {/* Input section */}
        <View style={{marginBottom: 16}}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: '#1A1A1A',
              marginBottom: 8,
            }}>
            {`Word ${currentWordIndex + 1}`}
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <View
              style={[
                styles.inputContainer,
                isFocused && styles.inputContainerFocused,
              ]}
            >
              <RNTextInput
                ref={inputRef}
                value={currentWord}
                onChangeText={setCurrentWord}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Type at least 3 letters..."
                placeholderTextColor="#999"
                returnKeyType="done"
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                onSubmitEditing={() => addWord(currentWord)}
                style={styles.input}
              />
            </View>
            <Button
              onPress={() => addWord(currentWord)}
              mode="contained"
              labelStyle={{
                fontWeight: '600',
                fontSize: 14,
                textTransform: 'none',
              }}
              style={{
                height: 48,
                marginLeft: 8,
                borderRadius: 12,
                justifyContent: 'center',
              }}
              disabled={currentWord == null || currentWord.length === 0}>
              {'Next'}
            </Button>
          </View>
        </View>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <View style={{marginBottom: 16}}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{paddingVertical: 4}}>
              {suggestions.map((suggestion, index) => (
                <Chip
                  key={index}
                  mode="outlined"
                  onPress={() => selectSuggestion(suggestion)}
                  style={{
                    marginRight: 8,
                    backgroundColor: Colors.secondaryColor,
                    borderColor: Colors.primaryColor,
                  }}
                  textStyle={{
                    fontSize: 14,
                    color: Colors.primaryColor,
                  }}>
                  {suggestion}
                </Chip>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Spacer */}
        <View style={{flex: 1}} />

        {/* Import button */}
        {keyboardOffset === 0 && (
          <GradientButton
            onPress={handleImport}
            disabled={!isValidMnemonic}
            style={styles.importButton}
          >
            {'Import'}
          </GradientButton>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    height: 48,
  },
  inputContainerFocused: {
    backgroundColor: '#FFF',
    borderColor: Colors.primaryColor,
    shadowColor: Colors.primaryColor,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 2},
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000',
  },
  importButton: {
    marginBottom: 24,
  },
});
