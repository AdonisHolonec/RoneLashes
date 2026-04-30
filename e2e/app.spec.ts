import { expect, test } from '@playwright/test'

const openSchedule = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  day_of_week: dayOfWeek,
  open_time: '09:00',
  close_time: '18:00',
  is_day_off: false,
}))

test('client can log in and complete a mocked booking flow', async ({ page }) => {
  let capturedBooking: Record<string, unknown> | null = null

  await page.addInitScript(() => {
    const fixedNow = new Date('2026-04-15T09:00:00+03:00').valueOf()
    const RealDate = Date

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedNow)
          return
        }

        switch (args.length) {
          case 1:
            super(args[0])
            break
          case 2:
            super(args[0], args[1])
            break
          case 3:
            super(args[0], args[1], args[2])
            break
          case 4:
            super(args[0], args[1], args[2], args[3])
            break
          case 5:
            super(args[0], args[1], args[2], args[3], args[4])
            break
          case 6:
            super(args[0], args[1], args[2], args[3], args[4], args[5])
            break
          default:
            super(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
            break
        }
      }

      static now() {
        return fixedNow
      }
    }

    Object.setPrototypeOf(MockDate, RealDate)
    // @ts-expect-error test override
    window.Date = MockDate
  })

  await page.route('**/api/public/portal', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        services: [
          {
            id: 'svc-soft-volume',
            name: 'Soft Volume',
            price: '250',
            duration_minutes: 120,
            category: 'Volum',
            subcategory: 'Soft',
          },
        ],
        bookedAppointments: [],
        photos: [],
        portfolioRatings: [],
        myPortfolioRatings: [],
        schedule: openSchedule,
        closures: [],
        publicReviews: [
          {
            id: 'review-1',
            start_time: '2026-04-20T10:00:00.000Z',
            rating: 5,
            review_text: 'Rezultat impecabil si rezistenta excelenta.',
            client_name: 'Ana Pop',
            notes: 'Soft Volume',
          },
        ],
        categoryOrder: ['Volum'],
        subcategoryOrder: ['Soft'],
      }),
    })
  })

  await page.route('**/api/client/auth', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ client: null }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        client: {
          id: 'client-1',
          phone: '0712345678',
          full_name: 'Ana Pop',
        },
      }),
    })
  })

  await page.route('**/api/client/appointments', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: [] }),
      })
      return
    }

    capturedBooking = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.route('**/api/client/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        preferences: {
          preferredStyle: 'Soft Volume',
          sensitivityNotes: '',
          appointmentNotes: '',
        },
      }),
    })
  })

  await page.goto('/')

  await expect(page.getByTestId('client-auth-phone')).toBeVisible()
  await expect(page.getByText(/Intrebari frecvente/i)).toBeVisible()

  await page.getByTestId('client-auth-phone').fill('0712345678')
  await page.getByTestId('client-auth-pin').fill('1234')
  await page.getByTestId('client-auth-submit').click()

  await expect(page.getByTestId('client-dashboard')).toBeVisible()
  await page.getByTestId('new-booking-button').click()

  await expect(page.getByTestId('booking-view')).toBeVisible()
  await page.getByTestId('category-toggle-volum').click()
  await page.getByTestId('service-option-svc-soft-volume').click()
  await page.getByTestId('booking-continue-button').click()

  await page.locator('[data-testid="booking-date-picker"] .rdp-day_button:not([disabled])').first().click()
  await page.locator('[data-testid^="booking-time-"]').first().click()
  await page.getByTestId('booking-confirm-button').click()

  await expect.poll(() => capturedBooking?.action).toBe('create')
  await expect.poll(() => capturedBooking?.serviceIds).toEqual(['svc-soft-volume'])
  await expect(page.locator('a[href*="wa.me/"]')).toHaveCount(1)
})

test('admin can log in and reach dashboard data loaded from mocked API', async ({ page }) => {
  await page.route('**/api/admin/dashboard?mode=dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        appointments: [],
        services: [
          {
            id: 'svc-admin-1',
            name: 'Laminare Gene',
            price: '180',
            duration_minutes: 60,
            category: 'Laminare',
            subcategory: null,
          },
        ],
        portfolioRatings: [],
        schedule: openSchedule,
        waitlist: [],
        closures: [],
        portfolio: { items: [], hasMore: false, page: 0 },
        reviews: { items: [], hasMore: false, page: 0 },
      }),
    })
  })

  await page.goto('/login')

  await page.getByTestId('admin-pin-input').fill('1234')
  await page.getByTestId('admin-login-submit').click()

  await expect(page.getByTestId('admin-dashboard')).toBeVisible()
  await page.getByTestId('admin-tab-services').click()
  await expect(page.getByText('Laminare Gene')).toBeVisible()
})
