'use client'
import { useActionState } from 'react'
import { enterDev, type EnterState } from './actions'

export function EnterForm({ users }: { users: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<EnterState, FormData>(enterDev, null)
  return (
    <form action={action} id="dev-enter-form">
      <p>
        <label htmlFor="token">Developer access token</label>
        <input id="token" name="token" type="password" autoComplete="off" required />
      </p>
      <p>
        <label htmlFor="userId">Act as</label>
        <select id="userId" name="userId" required>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </p>
      {state?.error && (
        <p role="alert" id="dev-enter-error">
          {state.error}
        </p>
      )}
      <button type="submit" id="dev-enter-submit" disabled={pending}>
        {pending ? 'Checking…' : 'Enter'}
      </button>
    </form>
  )
}
