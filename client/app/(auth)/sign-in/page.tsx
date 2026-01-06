
"use client"
import { LoginForm } from '@/components/ui/login-form'
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import React from 'react'

const Page =  () => {
  const {data , isPending , } = authClient.useSession();
  const router = useRouter();

  if(data?.session && data?.user){
    router.push("/")
  }
  
  if(isPending){
    return (
      <div className="flex flex-col items-center justify-center h-screen">
          <Spinner />
      </div>
    )
  }

  
  return (

    <LoginForm />

  )
}

export default Page