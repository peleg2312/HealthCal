import { describe, expect, it } from 'vitest';

import { drinkByDefault } from './drinkDefault';

describe('the own-food switch "This is a drink" by default', () => {
  it.each([
    ['1 cup (250 ml)', 'Bone broth', false],
    ['330 ml', 'My iced coffee', true],
    ['1 bottle (0,5 l)', 'Vegetable soup', false],
    ['15 ml', 'Olive oil', false],
    ['1 serving', 'Shake', false],
    ['250 ml', 'מרק עוף', false],
    ['1 bottle (0,5 l)', 'Lemonade', true],
    ['12 fl oz', 'Cold brew', true],
    ['1 cup', 'Homemade lemonade', false],
    ['330 ml', '', true],
  ])('%s with "%s": %s', (serving, name, on) => {
    expect(drinkByDefault(serving, name)).toBe(on);
  });
});
