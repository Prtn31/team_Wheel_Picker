/* The picker state is independent of the page, so it can also be tested in Node. */
(function (root) {
  const SETS = {
    '12OAD': ['Prathyusha', 'Sunil', 'Nitin', 'Shiva', 'Satish', 'Uma', 'Dinesh', 'Pavithran', 'Dakshita', 'Kuno', 'Matthias', 'Gunter', 'Andreas', 'Alex', 'Claudia', 'Florian', 'Manfred', 'Tobias', 'Sepp'],
    '12OAD German': ['Kuno', 'Matthias', 'Gunter', 'Andreas', 'Alex', 'Claudia', 'Florian', 'Manfred', 'Tobias', 'Sepp'],
    '12INOAD': ['Prathyusha', 'Sunil', 'Nitin', 'Shiva', 'Satish', 'Uma', 'Dinesh', 'Pavithran', 'Dakshita']
  };
  const ORIGINAL_ITEMS = SETS['12OAD'];

  function randomIndex(count) {
    if (!Number.isInteger(count) || count < 1 || count > 4294967296) throw new RangeError('Invalid number of choices.');
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      try {
        const values = new Uint32Array(1);
        const limit = Math.floor(4294967296 / count) * count;
        do { root.crypto.getRandomValues(values); } while (values[0] >= limit);
        return values[0] % count;
      } catch (error) {
        // Fall back on browsers where secure random values are unavailable.
      }
    }
    return Math.floor(Math.random() * count);
  }

  class Picker {
    constructor(items = ORIGINAL_ITEMS) {
      this.originalItems = [...items];
      this.reset();
    }

    reset() {
      this.remaining = [...this.originalItems];
      this.picks = [];
      this.finalPick = null;
    }

    add(name) {
      name = name.trim();
      if (!name || name.length > 60) throw new RangeError('Enter a name between 1 and 60 characters.');
      if (this.originalItems.some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new RangeError('That name is already in this set.');
      }
      this.finalPick = null;
      this.originalItems.push(name);
      this.remaining.push(name);
    }

    remove(name) {
      if (!this.originalItems.includes(name)) return;
      this.originalItems = this.originalItems.filter(item => item !== name);
      this.remaining = this.remaining.filter(item => item !== name);
      this.picks = this.picks.filter(item => item !== name);
      if (this.finalPick === name) this.finalPick = null;
    }

    pick(index) {
      if (this.remaining.length <= 1 || !Number.isInteger(index) || index < 0 || index >= this.remaining.length) {
        throw new RangeError('Choose a valid item while at least two items remain.');
      }
      const selected = this.remaining.splice(index, 1)[0];
      this.picks.push(selected);
      return { selected };
    }

    pickFinal() {
      if (this.remaining.length !== 1) throw new RangeError('Exactly one name must remain.');
      const selected = this.remaining.pop();
      this.picks.push(selected);
      this.finalPick = selected;
      return { selected, isFinal: true };
    }
  }

  root.WheelPicker = { Picker, ORIGINAL_ITEMS, SETS, randomIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WheelPicker;
})(typeof globalThis !== 'undefined' ? globalThis : this);