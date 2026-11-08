import { Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconLock, IconMail } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { LANGUAGES } from '../i18n';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : t('login.emailInvalid')),
      password: (value) => (value.length >= 6 ? null : t('login.passwordShort')),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setBusy(true);
    try {
      const user = await signIn(values.email, values.password);
      notifications.show({ title: t('login.welcome'), message: user.email, color: 'teal', radius: 'xl' });
      navigate('/', { replace: true });
    } catch {
      notifications.show({ title: t('login.failed'), message: '', color: 'red', radius: 'xl' });
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="login">
      <div className="login__card">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div className="brandmark" aria-hidden>
              {t('brand.mark')}
            </div>
            <Group gap={6}>
              {LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  type="button"
                  className="capsule capsule--wide"
                  style={{ height: 32, fontSize: 12, opacity: i18n.resolvedLanguage === language.code ? 1 : 0.55 }}
                  onClick={() => void i18n.changeLanguage(language.code)}
                >
                  {language.short}
                </button>
              ))}
            </Group>
          </Group>

          <Stack gap={4}>
            <Text className="pagehead__kicker" component="div">
              {t('login.subtitle')}
            </Text>
            <Text fz={30} fw={500} style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {t('login.title')}
            </Text>
          </Stack>

          <form onSubmit={submit}>
            <Stack gap="md">
              <TextInput
                label={t('login.email')}
                placeholder="you@signque.in"
                leftSection={<IconMail size={16} stroke={1.7} />}
                {...form.getInputProps('email')}
              />
              <PasswordInput
                label={t('login.password')}
                placeholder="••••••••"
                leftSection={<IconLock size={16} stroke={1.7} />}
                {...form.getInputProps('password')}
              />
              <Button type="submit" fullWidth size="md" loading={busy} rightSection={<IconArrowRight size={16} stroke={1.9} />}>
                {t('login.submit')}
              </Button>
              <Text fz={11} c="dimmed" ta="center">
                {t('login.hint')}
              </Text>
            </Stack>
          </form>
        </Stack>
      </div>
    </div>
  );
}
