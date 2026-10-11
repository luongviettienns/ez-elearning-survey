# Ez-Elearning — Website khảo sát giáo viên

Website dạng storytelling một trang, cuộn từ câu chuyện AI tới biểu mẫu phản hồi. Giao diện responsive, chuyển động khi cuộn, 14 câu hỏi, lưu dữ liệu bền vững bằng tệp JSONL và có trang admin xuất CSV/JSON.

## Chạy thử trong máy (Windows / Mac / Linux)

Yêu cầu **Node.js 20+**. Chạy server không cần npm packages; chạy tests cần `npm ci`.

```bash
cd ez-elearning-survey
# Windows PowerShell:
$env:ADMIN_KEY="mat-khau-quan-tri-day-du-it-nhat-12-ky-tu"
npm start
# macOS/Linux:
# ADMIN_KEY="mat-khau-quan-tri-day-du-it-nhat-12-ky-tu" npm start
```

- Biểu mẫu: <http://localhost:3000>
- Thống kê quản trị: <http://localhost:3000/admin>
- API sức khỏe: <http://localhost:3000/api/health>
- Nhấn **Gửi ý kiến** để lưu vào `data/submissions.jsonl`.
- Vào `/admin`, nhập chính xác ADMIN_KEY để xem số phản hồi, biểu đồ và tải CSV hoặc JSON.

## Triển khai trên Internet

Hosting **Node.js chạy lâu dài** (VPS, Render có persistent disk, Railway có volume, ...): `npm start` + PORT được cấp bởi nền tảng + `ADMIN_KEY` đủ mạnh + `DATA_DIR` trỏ tới **volume lưu trữ bền vững**. Cấu hình HTTPS và sao lưu volume thường xuyên.

### Vercel

- Framework Preset: **Node.js**. Hai HTTP entrypoint dùng chung module lưu trữ và giới hạn gửi.
- Đặt `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (khóa server **sb_secret** hoặc JWT **service_role**) và `ADMIN_KEY` (ít nhất 12 ký tự). Không dùng publishable/anon cho backend.
- **Làm theo [docs/ROLLOUT.md](docs/ROLLOUT.md) trước khi merge/deploy bản sửa**: cập nhật cả khóa cũ `SUPABASE_KEY`, redeploy code cũ, chạy `supabase.sql`, rồi deploy code mới.
- Migration khóa đọc/ghi trực tiếp bằng public key; phản hồi chỉ được gửi qua API server. IP được băm HMAC, không lưu IP thô. PostgreSQL kiểm tra cooldown 15 giây và lưu phản hồi trong cùng transaction, áp dụng giữa các instance.
- Admin thống kê/export đọc theo từng trang, sắp xếp phản hồi mới nhất trước. Health chỉ kiểm tra cấu hình, không kiểm tra kết nối hoặc quyền database.
- Trên Vercel không ghi file local. Local không cấu hình Supabase vẫn dùng JSONL; nếu cấu hình Supabase thì chỉ lưu vào database.

Chạy `npm ci` rồi `npm test` để kiểm tra. Production không cần thư viện npm ngoài; PGlite chỉ là dev dependency để kiểm tra quyền và transaction PostgreSQL trong RAM.

Không có OpenAI API key trong project: đây là trang **khảo sát** về tính năng AI, không tạo ảnh hoặc gọi AI. Chi phí 1.000đ/ảnh là giả định dùng trong khảo sát, không phải giá cố định hoặc cam kết chất lượng.

## Quyền riêng tư & bảo mật

- Không bắt buộc thu tên, số điện thoại hoặc email.
- Email tùy chọn nếu giáo viên muốn được liên hệ.
- Phải chấp thuận mục đích thu thập dữ liệu trước khi gửi.
- `ADMIN_KEY` đặt trên **server**, không viết trong frontend, không commit.
- Data lưu dạng JSONL (mỗi phản hồi 1 dòng); admin phải đăng nhập mới tải được.
- Endpoint POST có honeypot và cooldown dùng chung trên Supabase. Với chiến dịch công khai lớn, cần thêm CAPTCHA hoặc bảo vệ tại Vercel Firewall; cooldown theo IP không ngăn được bot dùng nhiều IP.

## Cấu trúc

```
server.mjs             # HTTP server, ghi khảo sát, thống kê, CSV
public/index.html     # Landing + form 4 chương
public/styles.css     # Tokens, responsive, scroll effects
public/app.js         # Logic khảo sát, validate, submit
public/admin.html     # Trang quản trị
public/admin.js       # Thống kê + export
public/mark.svg       # Biểu tượng logo
```

## Lưu ý sản phẩm

Đoạn nội dung về API (~1.000đ/ảnh) chỉ mang tính minh họa và phải kiểm chứng theo model, chất lượng và đầu ra thực tế. **Không cam kết 100%** về chính tả, lỗi dấu hoặc tính chính xác kiến thức của hình AI. Phiên bản ChatGPT miễn phí có thể có hạn mức khác nhau theo thời gian.

## Hiệu ứng cuộn và điểm nhấn (V2)

- Cuộn xuống: từng khối văn bản / thẻ tính năng xuất hiện dần; tiêu đề chương mở từng chữ theo vị trí cuộn.
- Phân cảnh **Từ ý tưởng → Prompt rõ ràng**: hai khung so sánh và đường tiến trình chuyển động theo vị trí cuộn.
- Phần giá ~1.000đ: đếm số một lần khi xuất hiện; chỉ thể hiện **giả định khảo sát**, không phải báo giá cố định.
- Biểu mẫu: từng câu xuất hiện nhẹ, lựa chọn được phản hồi tức thì; thanh tiến trình trên cùng và thanh chương ở màn hình lớn.
- Không cần thêm thư viện GSAP hoặc Framer Motion. Scroll dùng `requestAnimationFrame` + `IntersectionObserver`, hỗ trợ thiết lập giảm chuyển động.
- Có thể mở `ez-elearning-survey-preview.html` riêng để xem hiệu ứng **không cần backend**. Gửi khảo sát trong bản này chỉ mô phỏng; dữ liệu thực chỉ được lưu khi chạy server Node.js từ thư mục mã nguồn.
