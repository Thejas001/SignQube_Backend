import {
  Badge,
  Button,
  Card,
  Drawer,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Popover,
  Select,
  Table,
  TextInput,
  Textarea,
  createTheme,
  type MantineColorsTuple,
} from '@mantine/core';

const brand: MantineColorsTuple = [
  '#e8f4fc',
  '#d0e6f9',
  '#9dcbf1',
  '#68aee9',
  '#3d95e2',
  '#2085de',
  '#0f79db',
  '#0065c4',
  '#005ab1',
  '#002e5d',
];

/* Near-black neutral ramp so every Mantine surface sits on the glass, not on slate. */
const dark: MantineColorsTuple = [
  '#c9ced8',
  '#a6acba',
  '#8b93a7',
  '#5d6474',
  '#3a3f4b',
  '#272b33',
  '#191c22',
  '#111318',
  '#0b0d11',
  '#06070a',
];

export const theme = createTheme({
  colors: { brand, dark },
  primaryColor: 'brand',
  primaryShade: 6,
  fontFamily: '"Poppins", -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "JetBrains Mono", monospace',
  headings: { fontFamily: '"Poppins", -apple-system, "Segoe UI", Roboto, sans-serif', fontWeight: '700' },
  defaultRadius: 'md',
  shadows: {
    xs: '0 1px 2px rgba(15,23,42,0.04)',
    sm: '0 1px 3px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.04)',
  },
  components: {
    Button: Button.extend({ defaultProps: { radius: 'xl' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'xl' } }),
    Card: Card.extend({ defaultProps: { radius: 'xl', withBorder: true } }),
    Modal: Modal.extend({ defaultProps: { radius: 'xl', centered: true } }),
    Drawer: Drawer.extend({ defaultProps: { radius: 0 } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Popover: Popover.extend({ defaultProps: { radius: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md' } }),
    Textarea: Textarea.extend({ defaultProps: { radius: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: 'md' } }),
    Select: Select.extend({ defaultProps: { radius: 'md' } }),
    NumberInput: NumberInput.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: 'xs', highlightOnHover: true } }),
  },
});
