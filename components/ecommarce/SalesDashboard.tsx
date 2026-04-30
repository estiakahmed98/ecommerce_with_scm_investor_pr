"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  Users,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// Sample data for charts
const salesData = [
  { name: "Jan", sales: 4000 },
  { name: "Feb", sales: 3000 },
  { name: "Mar", sales: 5000 },
  { name: "Apr", sales: 4500 },
  { name: "May", sales: 6000 },
  { name: "Jun", sales: 5500 },
  { name: "Jul", sales: 7000 },
];

const categoryData = [
  { name: "Fiction", value: 35 },
  { name: "Non-Fiction", value: 25 },
  { name: "Science Fiction", value: 15 },
  { name: "Biography", value: 10 },
  { name: "Self-Help", value: 15 },
];

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

const recentOrders = [
  {
    id: "ORD-001",
    customer: "John Doe",
    date: "2023-03-15",
    status: "Delivered",
    total: 59.98,
    items: 2,
  },
  {
    id: "ORD-002",
    customer: "Jane Smith",
    date: "2023-03-14",
    status: "Processing",
    total: 29.99,
    items: 1,
  },
  {
    id: "ORD-003",
    customer: "Robert Johnson",
    date: "2023-03-14",
    status: "Shipped",
    total: 89.97,
    items: 3,
  },
  {
    id: "ORD-004",
    customer: "Emily Davis",
    date: "2023-03-13",
    status: "Delivered",
    total: 44.99,
    items: 1,
  },
  {
    id: "ORD-005",
    customer: "Michael Wilson",
    date: "2023-03-12",
    status: "Delivered",
    total: 74.98,
    items: 2,
  },
];

const lowStockItems = [
  {
    id: 1,
    title: "The Midnight Library",
    stock: 3,
    threshold: 5,
  },
  {
    id: 2,
    title: "Atomic Habits",
    stock: 2,
    threshold: 5,
  },
  {
    id: 3,
    title: "Project Hail Mary",
    stock: 4,
    threshold: 5,
  },
];

const recentMessages = [
  {
    id: 1,
    user: "John Doe",
    message: "When will 'The Midnight Library' be back in stock?",
    time: "2 hours ago",
    unread: true,
  },
  {
    id: 2,
    user: "Jane Smith",
    message: "I haven't received my order yet (ORD-002).",
    time: "5 hours ago",
    unread: true,
  },
  {
    id: 3,
    user: "Robert Johnson",
    message: "Do you offer international shipping?",
    time: "1 day ago",
    unread: false,
  },
];

export default function EcommarceAdminDashboard() {
  const [period, setPeriod] = useState("7days");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">Last 7 days</SelectItem>
            <SelectItem value="30days">Last 30 days</SelectItem>
            <SelectItem value="90days">Last 90 days</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$12,345.67</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500 font-medium flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12.5%
              </span>{" "}
              from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">256</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500 font-medium flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                +8.2%
              </span>{" "}
              from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,024</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500 font-medium flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                +5.3%
              </span>{" "}
              from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Books</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">512</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-red-500 font-medium flex items-center">
                <TrendingDown className="h-3 w-3 mr-1" />
                -2.1%
              </span>{" "}
              from last period
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mt-6">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>
              Monthly sales performance for the current year
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={salesData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="sales" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
            <CardDescription>
              Distribution of sales across book categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">
              Low Stock Alert
            </CardTitle>
            <AlertCircle className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Stock: {item.stock}/{item.threshold}
                    </p>
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.stock <= 3
                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    {item.stock <= 3 ? "Critical" : "Low"}
                  </div>
                </div>
              ))}
              <Link
                href="/admin/inventory"
                className="text-sm text-primary hover:underline block text-center mt-2"
              >
                View all inventory
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">
              Recent Messages
            </CardTitle>
            <MessageSquare className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMessages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-start justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium flex items-center">
                      {message.user}
                      {message.unread && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-blue-500" />
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {message.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {message.time}
                    </p>
                  </div>
                </div>
              ))}
              <Link
                href="/admin/messages"
                className="text-sm text-primary hover:underline block text-center mt-2"
              >
                View all messages
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest customer orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOrders.slice(0, 3).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{order.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.customer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.date} • ${order.total.toFixed(2)}
                    </p>
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.status === "Delivered"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : order.status === "Shipped"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    {order.status}
                  </div>
                </div>
              ))}
              <Link
                href="/admin/operations/orders"
                className="text-sm text-primary hover:underline block text-center mt-2"
              >
                View all orders
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div >
  );
}
